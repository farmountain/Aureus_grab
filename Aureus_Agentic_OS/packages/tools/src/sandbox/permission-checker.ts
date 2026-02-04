/**
 * Permission checker for sandbox operations
 * Validates filesystem, network, and resource access
 */

import {
  SandboxPermissions,
  FilesystemPermissions,
  NetworkPermissions,
  ResourceLimits,
  PermissionCheckResult,
} from './types';

/**
 * Permission checker that enforces sandbox constraints
 */
export class PermissionChecker {
  private permissions: SandboxPermissions;

  constructor(permissions: SandboxPermissions) {
    this.permissions = permissions;
  }

  /**
   * Check filesystem read permission
   */
  checkFilesystemRead(path: string): PermissionCheckResult {
    const fs = this.permissions.filesystem;

    // Check denied paths first (they override everything)
    if (this.isPathDenied(path, fs.deniedPaths || [])) {
      return {
        granted: false,
        reason: `Path '${path}' is explicitly denied`,
        canEscalate: true,
      };
    }

    // Check read-only paths
    if (this.isPathAllowed(path, fs.readOnlyPaths || [])) {
      return { granted: true };
    }

    // Check read-write paths
    if (this.isPathAllowed(path, fs.readWritePaths || [])) {
      return { granted: true };
    }

    // No matching permission
    return {
      granted: false,
      reason: `Path '${path}' is not in allowed read paths`,
      canEscalate: true,
    };
  }

  /**
   * Check filesystem write permission
   */
  checkFilesystemWrite(path: string): PermissionCheckResult {
    const fs = this.permissions.filesystem;

    // Check denied paths first
    if (this.isPathDenied(path, fs.deniedPaths || [])) {
      return {
        granted: false,
        reason: `Path '${path}' is explicitly denied`,
        canEscalate: true,
      };
    }

    // Write requires read-write permission (not just read-only)
    if (this.isPathAllowed(path, fs.readWritePaths || [])) {
      return { granted: true };
    }

    // Check if it's in read-only paths (explicitly forbidden for write)
    if (this.isPathAllowed(path, fs.readOnlyPaths || [])) {
      return {
        granted: false,
        reason: `Path '${path}' is read-only`,
        canEscalate: true,
      };
    }

    return {
      granted: false,
      reason: `Path '${path}' is not in allowed write paths`,
      canEscalate: true,
    };
  }

  /**
   * Check network access permission
   */
  checkNetworkAccess(
    domain?: string,
    ip?: string,
    port?: number
  ): PermissionCheckResult {
    const net = this.permissions.network;

    // Check if network is enabled at all
    if (!net.enabled) {
      return {
        granted: false,
        reason: 'Network access is disabled for this sandbox',
        canEscalate: true,
      };
    }

    // Check denied domains first
    if (domain && this.isDomainDenied(domain, net.deniedDomains || [])) {
      return {
        granted: false,
        reason: `Domain '${domain}' is explicitly denied`,
        canEscalate: true,
      };
    }

    // Check allowed domains
    if (domain && net.allowedDomains && net.allowedDomains.length > 0) {
      if (!this.isDomainAllowed(domain, net.allowedDomains)) {
        return {
          granted: false,
          reason: `Domain '${domain}' is not in allowed domains list`,
          canEscalate: true,
        };
      }
    }

    // Check allowed IP ranges
    if (ip && net.allowedIpRanges && net.allowedIpRanges.length > 0) {
      if (!this.isIpAllowed(ip, net.allowedIpRanges)) {
        return {
          granted: false,
          reason: `IP '${ip}' is not in allowed IP ranges`,
          canEscalate: true,
        };
      }
    }

    // Check allowed ports
    if (port && net.allowedPorts && net.allowedPorts.length > 0) {
      if (!net.allowedPorts.includes(port)) {
        return {
          granted: false,
          reason: `Port ${port} is not in allowed ports list`,
          canEscalate: true,
        };
      }
    }

    return { granted: true };
  }

  /**
   * Check resource limit
   */
  checkResourceLimit(
    resourceType: 'cpu' | 'memory' | 'execution_time' | 'processes',
    value: number
  ): PermissionCheckResult {
    const limits = this.permissions.resources;

    switch (resourceType) {
      case 'cpu':
        if (limits.maxCpu !== undefined && value > limits.maxCpu) {
          return {
            granted: false,
            reason: `CPU usage ${value} exceeds limit ${limits.maxCpu}`,
            canEscalate: true,
          };
        }
        break;

      case 'memory':
        if (limits.maxMemory !== undefined && value > limits.maxMemory) {
          return {
            granted: false,
            reason: `Memory usage ${value} exceeds limit ${limits.maxMemory} bytes`,
            canEscalate: true,
          };
        }
        break;

      case 'execution_time':
        if (limits.maxExecutionTime !== undefined && value > limits.maxExecutionTime) {
          return {
            granted: false,
            reason: `Execution time ${value}ms exceeds limit ${limits.maxExecutionTime}ms`,
            canEscalate: false, // Time limits are hard limits
          };
        }
        break;

      case 'processes':
        if (limits.maxProcesses !== undefined && value > limits.maxProcesses) {
          return {
            granted: false,
            reason: `Process count ${value} exceeds limit ${limits.maxProcesses}`,
            canEscalate: true,
          };
        }
        break;
    }

    return { granted: true };
  }

  /**
   * Check capability permission
   */
  checkCapability(capability: string): PermissionCheckResult {
    const allowedCapabilities = this.permissions.capabilities || [];

    if (allowedCapabilities.includes(capability)) {
      return { granted: true };
    }

    return {
      granted: false,
      reason: `Capability '${capability}' is not allowed`,
      canEscalate: true,
    };
  }

  /**
   * Check environment variable access
   */
  checkEnvVar(varName: string): PermissionCheckResult {
    const allowedEnvVars = this.permissions.allowedEnvVars;

    // If no restriction specified, allow all
    if (!allowedEnvVars || allowedEnvVars.length === 0) {
      return { granted: true };
    }

    if (allowedEnvVars.includes(varName)) {
      return { granted: true };
    }

    return {
      granted: false,
      reason: `Environment variable '${varName}' is not allowed`,
      canEscalate: true,
    };
  }

  /**
   * Check if a path is allowed based on a list of allowed patterns
   */
  private isPathAllowed(path: string, allowedPaths: string[]): boolean {
    if (allowedPaths.length === 0) {
      return false;
    }

    // Normalize path
    const normalizedPath = this.normalizePath(path);

    return allowedPaths.some(allowedPath => {
      const normalizedAllowed = this.normalizePath(allowedPath);
      
      // Check exact match
      if (normalizedPath === normalizedAllowed) {
        return true;
      }
      
      // Check if path is under allowed directory
      if (normalizedPath.startsWith(normalizedAllowed + '/')) {
        return true;
      }
      
      // Check wildcard patterns (simple glob support)
      if (allowedPath.includes('*')) {
        const regex = this.globToRegex(allowedPath);
        return regex.test(normalizedPath);
      }
      
      return false;
    });
  }

  /**
   * Check if a path is denied
   */
  private isPathDenied(path: string, deniedPaths: string[]): boolean {
    if (deniedPaths.length === 0) {
      return false;
    }

    return this.isPathAllowed(path, deniedPaths);
  }

  /**
   * Check if a domain is allowed
   */
  private isDomainAllowed(domain: string, allowedDomains: string[]): boolean {
    const normalizedDomain = domain.toLowerCase();

    return allowedDomains.some(allowed => {
      const normalizedAllowed = allowed.toLowerCase();
      
      // Exact match
      if (normalizedDomain === normalizedAllowed) {
        return true;
      }
      
      // Subdomain match (e.g., *.example.com matches api.example.com)
      if (allowed.startsWith('*.')) {
        const baseDomain = normalizedAllowed.substring(2);
        return normalizedDomain === baseDomain || normalizedDomain.endsWith('.' + baseDomain);
      }
      
      return false;
    });
  }

  /**
   * Check if a domain is denied
   */
  private isDomainDenied(domain: string, deniedDomains: string[]): boolean {
    return this.isDomainAllowed(domain, deniedDomains);
  }

  /**
   * Check if an IP is in allowed ranges
   */
  private isIpAllowed(ip: string, allowedRanges: string[]): boolean {
    // Simple implementation - for production, use proper CIDR library
    return allowedRanges.some(range => {
      // For now, support exact IP match or wildcard ranges
      if (range === ip) {
        return true;
      }
      
      // Support simple wildcards like "192.168.1.*"
      if (range.includes('*')) {
        const regex = this.ipWildcardToRegex(range);
        return regex.test(ip);
      }
      
      // TODO: Add proper CIDR range support
      return false;
    });
  }

  /**
   * Normalize path for comparison
   */
  private normalizePath(path: string): string {
    // Remove trailing slashes
    let normalized = path.replace(/\/+$/, '');
    
    // Remove leading ./ 
    normalized = normalized.replace(/^\.\//, '');
    
    // Resolve .. and . in path (simple implementation)
    const parts = normalized.split('/');
    const resolved: string[] = [];
    
    for (const part of parts) {
      if (part === '..') {
        resolved.pop();
      } else if (part !== '.' && part !== '') {
        resolved.push(part);
      }
    }
    
    return '/' + resolved.join('/');
  }

  /**
   * Convert glob pattern to regex
   */
  private globToRegex(pattern: string): RegExp {
    const normalized = this.normalizePath(pattern);
    const escaped = normalized
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
      .replace(/\*/g, '.*') // Convert * to .*
      .replace(/\?/g, '.'); // Convert ? to .
    
    return new RegExp(`^${escaped}$`);
  }

  /**
   * Convert IP wildcard to regex
   */
  private ipWildcardToRegex(pattern: string): RegExp {
    // First escape all regex special characters except * which we'll handle separately
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars including backslash
      .replace(/\*/g, '\\d+'); // Convert * to \d+ after escaping
    
    return new RegExp(`^${escaped}$`);
  }

  /**
   * Update permissions (for dynamic permission changes)
   */
  updatePermissions(newPermissions: SandboxPermissions): void {
    this.permissions = newPermissions;
  }

  /**
   * Get current permissions
   */
  getPermissions(): SandboxPermissions {
    return { ...this.permissions };
  }
}
