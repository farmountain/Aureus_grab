/**
 * Runtime Adapter Registry
 * 
 * Central registry for managing runtime adapters and validating agent blueprints
 * against supported runtimes
 */

import { RuntimeAdapter, RuntimeAdapterConfig, RuntimeType } from './types';

/**
 * Runtime adapter registration entry
 */
export interface AdapterRegistration {
  /** Adapter instance */
  adapter: RuntimeAdapter;
  /** Registration timestamp */
  registeredAt: Date;
  /** Whether the adapter is currently active */
  active: boolean;
  /** Last health check result */
  lastHealthCheck?: {
    healthy: boolean;
    timestamp: Date;
  };
}

/**
 * Blueprint validation result
 */
export interface BlueprintValidationResult {
  /** Whether the blueprint is valid for the target runtime */
  valid: boolean;
  /** Validation errors */
  errors?: string[];
  /** Validation warnings */
  warnings?: string[];
  /** Compatible runtime adapters */
  compatibleAdapters?: string[];
  /** Recommended adapter for the blueprint */
  recommendedAdapter?: string;
}

/**
 * Runtime Adapter Registry
 * 
 * Manages registration, discovery, and validation of runtime adapters
 */
export class RuntimeAdapterRegistry {
  private adapters: Map<string, AdapterRegistration> = new Map();
  private adaptersByRuntime: Map<RuntimeType, Set<string>> = new Map();

  /**
   * Register a runtime adapter
   * @param adapter - Runtime adapter to register
   */
  register(adapter: RuntimeAdapter): void {
    const adapterId = adapter.config.adapterId;

    if (this.adapters.has(adapterId)) {
      throw new Error(`Adapter with ID '${adapterId}' is already registered`);
    }

    // Add to main registry
    this.adapters.set(adapterId, {
      adapter,
      registeredAt: new Date(),
      active: adapter.config.enabled,
    });

    // Add to runtime type index
    const runtimeType = adapter.config.runtimeType;
    if (!this.adaptersByRuntime.has(runtimeType)) {
      this.adaptersByRuntime.set(runtimeType, new Set());
    }
    this.adaptersByRuntime.get(runtimeType)!.add(adapterId);
  }

  /**
   * Unregister a runtime adapter
   * @param adapterId - ID of adapter to unregister
   */
  unregister(adapterId: string): void {
    const registration = this.adapters.get(adapterId);
    if (!registration) {
      throw new Error(`Adapter with ID '${adapterId}' is not registered`);
    }

    // Remove from runtime type index
    const runtimeType = registration.adapter.config.runtimeType;
    this.adaptersByRuntime.get(runtimeType)?.delete(adapterId);

    // Remove from main registry
    this.adapters.delete(adapterId);
  }

  /**
   * Get a runtime adapter by ID
   * @param adapterId - Adapter ID
   * @returns Runtime adapter or undefined
   */
  getAdapter(adapterId: string): RuntimeAdapter | undefined {
    return this.adapters.get(adapterId)?.adapter;
  }

  /**
   * Get all runtime adapters for a specific runtime type
   * @param runtimeType - Runtime type
   * @returns Array of runtime adapters
   */
  getAdaptersByRuntime(runtimeType: RuntimeType): RuntimeAdapter[] {
    const adapterIds = this.adaptersByRuntime.get(runtimeType) || new Set();
    const adapters: RuntimeAdapter[] = [];

    for (const adapterId of adapterIds) {
      const registration = this.adapters.get(adapterId);
      if (registration && registration.active) {
        adapters.push(registration.adapter);
      }
    }

    return adapters;
  }

  /**
   * Get all registered runtime adapters
   * @returns Array of all runtime adapters
   */
  getAllAdapters(): RuntimeAdapter[] {
    return Array.from(this.adapters.values())
      .filter(reg => reg.active)
      .map(reg => reg.adapter);
  }

  /**
   * Check if a runtime type is supported
   * @param runtimeType - Runtime type to check
   * @returns True if runtime type has at least one registered adapter
   */
  isRuntimeSupported(runtimeType: RuntimeType): boolean {
    const adapters = this.getAdaptersByRuntime(runtimeType);
    return adapters.length > 0;
  }

  /**
   * Get supported runtime types
   * @returns Array of supported runtime types
   */
  getSupportedRuntimes(): RuntimeType[] {
    const supported: RuntimeType[] = [];

    for (const runtimeType of this.adaptersByRuntime.keys()) {
      if (this.getAdaptersByRuntime(runtimeType).length > 0) {
        supported.push(runtimeType);
      }
    }

    return supported;
  }

  /**
   * Validate an agent blueprint against available runtime adapters
   * @param blueprint - Agent blueprint to validate
   * @returns Validation result
   */
  async validateBlueprint(blueprint: {
    deploymentTarget?: string;
    requiredCapabilities?: string[];
    toolAdapters?: Array<{
      adapterId: string;
      adapterType: string;
      requiredCapabilities?: string[];
    }>;
  }): Promise<BlueprintValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const compatibleAdapters: string[] = [];

    // If no deployment target specified, it's valid but with a warning
    if (!blueprint.deploymentTarget) {
      warnings.push('No deployment target specified in blueprint');
      return {
        valid: true,
        warnings,
        compatibleAdapters: Array.from(this.adapters.keys()),
      };
    }

    // Map deployment target to runtime type
    const runtimeType = this.mapDeploymentTargetToRuntimeType(blueprint.deploymentTarget);
    if (!runtimeType) {
      errors.push(`Unknown deployment target: ${blueprint.deploymentTarget}`);
      return { valid: false, errors };
    }

    // Check if runtime type is supported
    if (!this.isRuntimeSupported(runtimeType)) {
      errors.push(`Deployment target '${blueprint.deploymentTarget}' (runtime: ${runtimeType}) is not supported. Supported runtimes: ${this.getSupportedRuntimes().join(', ')}`);
      return { valid: false, errors };
    }

    // Get adapters for the runtime type
    const adapters = this.getAdaptersByRuntime(runtimeType);

    // Validate capabilities against each adapter
    for (const adapter of adapters) {
      const capabilityValidation = await this.validateCapabilities(
        adapter,
        blueprint.requiredCapabilities || []
      );

      if (capabilityValidation.compatible) {
        compatibleAdapters.push(adapter.config.adapterId);
      } else {
        warnings.push(
          `Adapter '${adapter.config.adapterId}' is not fully compatible: ${capabilityValidation.reasons?.join(', ')}`
        );
      }
    }

    // If no compatible adapters found, it's an error
    if (compatibleAdapters.length === 0) {
      errors.push(
        `No compatible runtime adapters found for deployment target '${blueprint.deploymentTarget}' with required capabilities`
      );
      return { valid: false, errors, warnings };
    }

    // Select recommended adapter (first one, or most capable)
    const recommendedAdapter = this.selectRecommendedAdapter(
      adapters.filter(a => compatibleAdapters.includes(a.config.adapterId))
    );

    return {
      valid: true,
      warnings: warnings.length > 0 ? warnings : undefined,
      compatibleAdapters,
      recommendedAdapter: recommendedAdapter?.config.adapterId,
    };
  }

  /**
   * Perform health checks on all registered adapters
   * @returns Map of adapter IDs to health status
   */
  async performHealthChecks(): Promise<Map<string, { healthy: boolean; timestamp: Date; details?: unknown }>> {
    const results = new Map<string, { healthy: boolean; timestamp: Date; details?: unknown }>();

    for (const [adapterId, registration] of this.adapters.entries()) {
      if (!registration.active) {
        continue;
      }

      try {
        const health = await registration.adapter.getHealthStatus();
        
        registration.lastHealthCheck = {
          healthy: health.healthy,
          timestamp: new Date(),
        };

        results.set(adapterId, {
          healthy: health.healthy,
          timestamp: new Date(),
          details: health,
        });
      } catch (error: any) {
        registration.lastHealthCheck = {
          healthy: false,
          timestamp: new Date(),
        };

        results.set(adapterId, {
          healthy: false,
          timestamp: new Date(),
          details: { error: error.message },
        });
      }
    }

    return results;
  }

  /**
   * Get registry statistics
   * @returns Registry statistics
   */
  getStatistics(): {
    totalAdapters: number;
    activeAdapters: number;
    supportedRuntimes: number;
    adaptersByRuntime: Record<string, number>;
  } {
    const adaptersByRuntime: Record<string, number> = {};

    for (const [runtimeType, adapterIds] of this.adaptersByRuntime.entries()) {
      adaptersByRuntime[runtimeType] = adapterIds.size;
    }

    return {
      totalAdapters: this.adapters.size,
      activeAdapters: Array.from(this.adapters.values()).filter(r => r.active).length,
      supportedRuntimes: this.getSupportedRuntimes().length,
      adaptersByRuntime,
    };
  }

  // Private helper methods

  /**
   * Map deployment target to runtime type
   */
  private mapDeploymentTargetToRuntimeType(deploymentTarget: string): RuntimeType | null {
    const mapping: Record<string, RuntimeType> = {
      'robotics': RuntimeType.ROBOTICS,
      'humanoid': RuntimeType.HUMANOID,
      'mobile': RuntimeType.MOBILE,
      'smartphone': RuntimeType.MOBILE,
      'desktop': RuntimeType.DESKTOP,
      'smart-glasses': RuntimeType.SMART_GLASSES,
      'cloud': RuntimeType.CLOUD,
      'edge': RuntimeType.EDGE,
    };

    return mapping[deploymentTarget.toLowerCase()] || null;
  }

  /**
   * Validate capabilities against adapter
   */
  private async validateCapabilities(
    adapter: RuntimeAdapter,
    requiredCapabilities: string[]
  ): Promise<{
    compatible: boolean;
    reasons?: string[];
  }> {
    const reasons: string[] = [];
    const adapterCapabilities = adapter.config.capabilities;

    // Map capability names to adapter capability checks
    const capabilityChecks: Record<string, boolean> = {
      'real-time': adapterCapabilities.realTime,
      'low-latency': adapterCapabilities.lowLatency,
      'perception': adapterCapabilities.perception,
      'camera': adapterCapabilities.perception,
      'object-detection': adapterCapabilities.perception,
      'actuation': adapterCapabilities.actuation,
      'motors': adapterCapabilities.actuation,
      'servos': adapterCapabilities.actuation,
      'sandbox': adapterCapabilities.sandbox,
      'streaming': adapterCapabilities.streaming,
      'network': adapterCapabilities.network,
      'http-client': adapterCapabilities.network,
      'storage': adapterCapabilities.storage,
      'file-system': adapterCapabilities.storage,
      'gpu': adapterCapabilities.acceleration,
      'tpu': adapterCapabilities.acceleration,
      'neural-engine': adapterCapabilities.acceleration,
    };

    for (const capability of requiredCapabilities) {
      const normalized = capability.toLowerCase();
      
      // Check if capability is supported
      if (capabilityChecks[normalized] === false) {
        reasons.push(`Missing capability: ${capability}`);
      } else if (capabilityChecks[normalized] === undefined) {
        // Check custom capabilities
        if (!adapterCapabilities.custom?.[capability]) {
          reasons.push(`Unknown or unsupported capability: ${capability}`);
        }
      }
    }

    return {
      compatible: reasons.length === 0,
      reasons: reasons.length > 0 ? reasons : undefined,
    };
  }

  /**
   * Select the most appropriate adapter from compatible ones
   */
  private selectRecommendedAdapter(adapters: RuntimeAdapter[]): RuntimeAdapter | undefined {
    if (adapters.length === 0) {
      return undefined;
    }

    // For now, just return the first one
    // In the future, could rank by capabilities, performance, etc.
    return adapters[0];
  }
}

/**
 * Global runtime adapter registry instance
 */
export const globalRuntimeAdapterRegistry = new RuntimeAdapterRegistry();
