import { describe, it, expect, beforeEach } from 'vitest';
import { PermissionChecker, SandboxPermissions } from '../src/sandbox';

describe('PermissionChecker', () => {
  let permissions: SandboxPermissions;
  let checker: PermissionChecker;

  beforeEach(() => {
    permissions = {
      filesystem: {
        readOnlyPaths: ['/tmp', '/var/log'],
        readWritePaths: ['/tmp/sandbox'],
        deniedPaths: ['/etc', '/sys'],
        maxDiskUsage: 100 * 1024 * 1024,
        maxFileCount: 100,
      },
      network: {
        enabled: true,
        allowedDomains: ['*.example.com', 'api.trusted.com'],
        allowedPorts: [80, 443],
        deniedDomains: ['malicious.com'],
        maxBandwidth: 10 * 1024 * 1024,
      },
      resources: {
        maxCpu: 2,
        maxMemory: 512 * 1024 * 1024,
        maxExecutionTime: 60000,
        maxProcesses: 20,
      },
      capabilities: ['NET_BIND_SERVICE'],
      allowedEnvVars: ['PATH', 'HOME', 'USER'],
    };

    checker = new PermissionChecker(permissions);
  });

  describe('Filesystem permissions', () => {
    it('should allow reading from read-only paths', () => {
      const result = checker.checkFilesystemRead('/tmp/test.txt');
      expect(result.granted).toBe(true);
    });

    it('should allow reading from read-write paths', () => {
      const result = checker.checkFilesystemRead('/tmp/sandbox/data.txt');
      expect(result.granted).toBe(true);
    });

    it('should deny reading from denied paths', () => {
      const result = checker.checkFilesystemRead('/etc/passwd');
      expect(result.granted).toBe(false);
      expect(result.reason).toContain('denied');
    });

    it('should deny reading from unlisted paths', () => {
      const result = checker.checkFilesystemRead('/root/secret.txt');
      expect(result.granted).toBe(false);
      expect(result.canEscalate).toBe(true);
    });

    it('should allow writing to read-write paths', () => {
      const result = checker.checkFilesystemWrite('/tmp/sandbox/output.txt');
      expect(result.granted).toBe(true);
    });

    it('should deny writing to read-only paths', () => {
      const result = checker.checkFilesystemWrite('/tmp/readonly.txt');
      expect(result.granted).toBe(false);
      expect(result.reason).toContain('read-only');
    });

    it('should deny writing to denied paths', () => {
      const result = checker.checkFilesystemWrite('/etc/config');
      expect(result.granted).toBe(false);
    });

    it('should handle subdirectories correctly', () => {
      const readResult = checker.checkFilesystemRead('/tmp/deep/nested/file.txt');
      expect(readResult.granted).toBe(true);

      const writeResult = checker.checkFilesystemWrite('/tmp/sandbox/deep/nested/file.txt');
      expect(writeResult.granted).toBe(true);
    });

    it('should handle path normalization', () => {
      const result1 = checker.checkFilesystemRead('/tmp/../tmp/test.txt');
      const result2 = checker.checkFilesystemRead('/tmp/./test.txt');
      
      expect(result1.granted).toBe(true);
      expect(result2.granted).toBe(true);
    });
  });

  describe('Network permissions', () => {
    it('should allow access to allowed domains', () => {
      const result = checker.checkNetworkAccess('api.example.com');
      expect(result.granted).toBe(true);
    });

    it('should allow access to wildcard subdomains', () => {
      const result = checker.checkNetworkAccess('subdomain.example.com');
      expect(result.granted).toBe(true);
    });

    it('should allow access to explicitly allowed domains', () => {
      const result = checker.checkNetworkAccess('api.trusted.com');
      expect(result.granted).toBe(true);
    });

    it('should deny access to denied domains', () => {
      const result = checker.checkNetworkAccess('malicious.com');
      expect(result.granted).toBe(false);
      expect(result.reason).toContain('denied');
    });

    it('should deny access to unlisted domains', () => {
      const result = checker.checkNetworkAccess('random.com');
      expect(result.granted).toBe(false);
      expect(result.canEscalate).toBe(true);
    });

    it('should check allowed ports', () => {
      const result80 = checker.checkNetworkAccess('api.example.com', undefined, 80);
      const result443 = checker.checkNetworkAccess('api.example.com', undefined, 443);
      const result8080 = checker.checkNetworkAccess('api.example.com', undefined, 8080);

      expect(result80.granted).toBe(true);
      expect(result443.granted).toBe(true);
      expect(result8080.granted).toBe(false);
    });

    it('should deny network access when disabled', () => {
      permissions.network.enabled = false;
      checker = new PermissionChecker(permissions);

      const result = checker.checkNetworkAccess('example.com');
      expect(result.granted).toBe(false);
      expect(result.reason).toContain('disabled');
    });

    it('should handle IP addresses', () => {
      permissions.network.allowedIpRanges = ['192.168.1.*'];
      checker = new PermissionChecker(permissions);

      const result1 = checker.checkNetworkAccess(undefined, '192.168.1.100');
      const result2 = checker.checkNetworkAccess(undefined, '10.0.0.1');

      expect(result1.granted).toBe(true);
      expect(result2.granted).toBe(false);
    });
  });

  describe('Resource limits', () => {
    it('should allow CPU usage within limits', () => {
      const result = checker.checkResourceLimit('cpu', 1.5);
      expect(result.granted).toBe(true);
    });

    it('should deny CPU usage exceeding limits', () => {
      const result = checker.checkResourceLimit('cpu', 3);
      expect(result.granted).toBe(false);
      expect(result.reason).toContain('CPU');
      expect(result.canEscalate).toBe(true);
    });

    it('should allow memory usage within limits', () => {
      const result = checker.checkResourceLimit('memory', 256 * 1024 * 1024);
      expect(result.granted).toBe(true);
    });

    it('should deny memory usage exceeding limits', () => {
      const result = checker.checkResourceLimit('memory', 1024 * 1024 * 1024);
      expect(result.granted).toBe(false);
      expect(result.reason).toContain('Memory');
    });

    it('should allow execution time within limits', () => {
      const result = checker.checkResourceLimit('execution_time', 30000);
      expect(result.granted).toBe(true);
    });

    it('should deny execution time exceeding limits', () => {
      const result = checker.checkResourceLimit('execution_time', 90000);
      expect(result.granted).toBe(false);
      expect(result.reason).toContain('time');
      expect(result.canEscalate).toBe(false); // Time limits are hard limits
    });

    it('should allow process count within limits', () => {
      const result = checker.checkResourceLimit('processes', 10);
      expect(result.granted).toBe(true);
    });

    it('should deny process count exceeding limits', () => {
      const result = checker.checkResourceLimit('processes', 30);
      expect(result.granted).toBe(false);
      expect(result.reason).toContain('Process');
    });
  });

  describe('Capability permissions', () => {
    it('should allow granted capabilities', () => {
      const result = checker.checkCapability('NET_BIND_SERVICE');
      expect(result.granted).toBe(true);
    });

    it('should deny non-granted capabilities', () => {
      const result = checker.checkCapability('SYS_ADMIN');
      expect(result.granted).toBe(false);
      expect(result.canEscalate).toBe(true);
    });
  });

  describe('Environment variable permissions', () => {
    it('should allow listed environment variables', () => {
      const result = checker.checkEnvVar('PATH');
      expect(result.granted).toBe(true);
    });

    it('should deny unlisted environment variables', () => {
      const result = checker.checkEnvVar('SECRET_KEY');
      expect(result.granted).toBe(false);
    });

    it('should allow all env vars when no restriction specified', () => {
      permissions.allowedEnvVars = undefined;
      checker = new PermissionChecker(permissions);

      const result = checker.checkEnvVar('ANY_VAR');
      expect(result.granted).toBe(true);
    });
  });

  describe('Permission updates', () => {
    it('should update permissions dynamically', () => {
      let result = checker.checkFilesystemRead('/home/user/data.txt');
      expect(result.granted).toBe(false);

      const newPermissions: SandboxPermissions = {
        ...permissions,
        filesystem: {
          ...permissions.filesystem,
          readOnlyPaths: [...(permissions.filesystem.readOnlyPaths || []), '/home/user'],
        },
      };

      checker.updatePermissions(newPermissions);

      result = checker.checkFilesystemRead('/home/user/data.txt');
      expect(result.granted).toBe(true);
    });

    it('should get current permissions', () => {
      const current = checker.getPermissions();
      expect(current).toEqual(permissions);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty permissions lists', () => {
      const emptyPermissions: SandboxPermissions = {
        filesystem: {},
        network: { enabled: false },
        resources: {},
      };

      const emptyChecker = new PermissionChecker(emptyPermissions);

      const fsResult = emptyChecker.checkFilesystemRead('/tmp/test.txt');
      expect(fsResult.granted).toBe(false);
    });

    it('should handle wildcard patterns in paths', () => {
      permissions.filesystem.readOnlyPaths = ['/tmp/*'];
      checker = new PermissionChecker(permissions);

      const result = checker.checkFilesystemRead('/tmp/anything.txt');
      expect(result.granted).toBe(true);
    });

    it('should prioritize denied paths over allowed paths', () => {
      // Even if a parent directory is allowed, denied subdirectory should be blocked
      permissions.filesystem.readOnlyPaths = ['/tmp'];
      permissions.filesystem.deniedPaths = ['/tmp/forbidden'];
      checker = new PermissionChecker(permissions);

      const allowedResult = checker.checkFilesystemRead('/tmp/allowed.txt');
      const deniedResult = checker.checkFilesystemRead('/tmp/forbidden/secret.txt');

      expect(allowedResult.granted).toBe(true);
      expect(deniedResult.granted).toBe(false);
    });

    it('should handle case-insensitive domain matching', () => {
      const result1 = checker.checkNetworkAccess('API.EXAMPLE.COM');
      const result2 = checker.checkNetworkAccess('Api.Example.Com');

      expect(result1.granted).toBe(true);
      expect(result2.granted).toBe(true);
    });
  });
});
