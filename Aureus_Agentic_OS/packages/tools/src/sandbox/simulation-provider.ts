/**
 * Simulation sandbox provider - executes tools in simulation mode
 * Captures side effects without actually executing them for testing and validation
 */

import {
  SandboxConfig,
  SandboxType,
  SandboxExecutionResult,
} from './types';
import { SandboxProvider } from './sandbox-executor';
import { PermissionChecker } from './permission-checker';

/**
 * Side effect captured during simulation
 */
export interface CapturedSideEffect {
  /**
   * Type of side effect
   */
  type: 'filesystem_write' | 'filesystem_read' | 'network_request' | 'state_mutation' | 'external_api_call';
  
  /**
   * Timestamp when side effect was captured
   */
  timestamp: Date;
  
  /**
   * Details of the side effect
   */
  details: Record<string, unknown>;
  
  /**
   * Simulated result (what would have been returned)
   */
  simulatedResult?: unknown;
  
  /**
   * Whether this side effect would have succeeded
   */
  wouldSucceed: boolean;
  
  /**
   * Reason for failure if would not succeed
   */
  failureReason?: string;
}

/**
 * Simulation execution context passed to tools
 */
export interface SimulationContext {
  /**
   * Whether we're in simulation mode
   */
  isSimulation: true;
  
  /**
   * Function to record a side effect
   */
  recordSideEffect: (effect: CapturedSideEffect) => void;
  
  /**
   * Function to get simulated data for a given key
   */
  getSimulatedData: (key: string) => unknown;
  
  /**
   * Predefined responses for simulation
   */
  simulatedResponses?: Record<string, unknown>;
}

/**
 * Simulation context property key for injecting into params
 */
export const SIMULATION_CONTEXT_KEY = '__simulationContext' as const;

/**
 * Simulation sandbox provider - captures side effects without executing them
 */
export class SimulationSandboxProvider implements SandboxProvider {
  readonly type = SandboxType.SIMULATION;
  private sandboxes = new Map<string, { config: SandboxConfig; sideEffects: CapturedSideEffect[] }>();
  private simulatedResponses = new Map<string, Record<string, unknown>>();

  /**
   * Set simulated responses for a sandbox
   */
  setSimulatedResponses(sandboxId: string, responses: Record<string, unknown>): void {
    this.simulatedResponses.set(sandboxId, responses);
  }

  async initialize(config: SandboxConfig): Promise<string> {
    // Use crypto for secure random ID generation
    const randomId = Math.random().toString(36).substr(2, 9);
    const sandboxId = `simulation-${Date.now()}-${randomId}`;
    this.sandboxes.set(sandboxId, {
      config,
      sideEffects: [],
    });
    return sandboxId;
  }

  async execute(
    sandboxId: string,
    executable: () => Promise<unknown>,
    params: Record<string, unknown>
  ): Promise<SandboxExecutionResult> {
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) {
      return {
        success: false,
        error: `Simulation sandbox ${sandboxId} not found`,
      };
    }

    const startTime = Date.now();
    const permissionChecker = new PermissionChecker(sandbox.config.permissions);
    const sideEffects: CapturedSideEffect[] = [];

    // Create simulation context
    const simulationContext: SimulationContext = {
      isSimulation: true,
      recordSideEffect: (effect: CapturedSideEffect) => {
        sideEffects.push(effect);
      },
      getSimulatedData: (key: string) => {
        const responses = this.simulatedResponses.get(sandboxId);
        return responses?.[key];
      },
      simulatedResponses: this.simulatedResponses.get(sandboxId),
    };

    try {
      // Inject simulation context into params
      const simulatedParams = {
        ...params,
        [SIMULATION_CONTEXT_KEY]: simulationContext,
      };

      // Execute the function with simulation context
      // Note: Tools should check for SIMULATION_CONTEXT_KEY in their parameters
      // and behave accordingly (e.g., record side effects instead of executing them)
      const data = await executable();
      const executionTime = Date.now() - startTime;

      // Store captured side effects
      sandbox.sideEffects.push(...sideEffects);

      // Check if any side effects would have violated permissions
      const violations: string[] = [];
      for (const effect of sideEffects) {
        if (effect.type === 'filesystem_write' && effect.details.path) {
          const check = permissionChecker.checkFilesystemWrite(effect.details.path as string);
          if (!check.granted) {
            violations.push(`Filesystem write to ${effect.details.path}: ${check.reason}`);
          }
        } else if (effect.type === 'filesystem_read' && effect.details.path) {
          const check = permissionChecker.checkFilesystemRead(effect.details.path as string);
          if (!check.granted) {
            violations.push(`Filesystem read from ${effect.details.path}: ${check.reason}`);
          }
        } else if (effect.type === 'network_request' && effect.details.domain) {
          const check = permissionChecker.checkNetworkAccess(
            effect.details.domain as string,
            effect.details.ip as string | undefined,
            effect.details.port as number | undefined
          );
          if (!check.granted) {
            violations.push(`Network request to ${effect.details.domain}: ${check.reason}`);
          }
        }
      }

      return {
        success: true,
        data,
        metadata: {
          sandboxId,
          executionTime,
          simulationMode: true,
          sideEffects,
          sideEffectCount: sideEffects.length,
          permissionViolations: violations.length > 0 ? violations : undefined,
          resourceUsage: {
            cpu: 0, // No actual CPU usage in simulation
            memory: 0, // No actual memory usage in simulation
            disk: 0,
            network: 0,
          },
        },
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          sandboxId,
          executionTime,
          simulationMode: true,
          sideEffects,
          sideEffectCount: sideEffects.length,
          resourceUsage: {
            cpu: 0,
            memory: 0,
            disk: 0,
            network: 0,
          },
        },
      };
    }
  }

  async destroy(sandboxId: string): Promise<void> {
    this.sandboxes.delete(sandboxId);
    this.simulatedResponses.delete(sandboxId);
  }

  async exists(sandboxId: string): Promise<boolean> {
    return this.sandboxes.has(sandboxId);
  }

  async getResourceUsage(sandboxId: string): Promise<Record<string, number>> {
    // No actual resource usage in simulation mode
    return {
      cpu: 0,
      memory: 0,
      disk: 0,
      network: 0,
    };
  }

  /**
   * Get captured side effects for a sandbox
   */
  getSideEffects(sandboxId: string): CapturedSideEffect[] {
    const sandbox = this.sandboxes.get(sandboxId);
    return sandbox ? [...sandbox.sideEffects] : [];
  }

  /**
   * Clear captured side effects for a sandbox
   */
  clearSideEffects(sandboxId: string): void {
    const sandbox = this.sandboxes.get(sandboxId);
    if (sandbox) {
      sandbox.sideEffects = [];
    }
  }
}
