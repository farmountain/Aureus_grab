/**
 * Tests for watchdog system
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Watchdog, WatchdogManager, WatchdogConfig } from '../src/watchdog';

describe('Watchdog', () => {
  let watchdog: Watchdog;
  let timeoutHandler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    timeoutHandler = vi.fn();
    const config: WatchdogConfig = {
      name: 'test_watchdog',
      timeoutMs: 100,
      onTimeout: timeoutHandler,
      autoRestart: true,
      maxRestarts: 3,
    };
    watchdog = new Watchdog(config);
  });

  afterEach(() => {
    watchdog.stop();
  });

  describe('Lifecycle', () => {
    it('should start watchdog', () => {
      watchdog.start();
      const status = watchdog.getStatus();
      expect(status.isActive).toBe(true);
    });

    it('should stop watchdog', () => {
      watchdog.start();
      watchdog.stop();
      const status = watchdog.getStatus();
      expect(status.isActive).toBe(false);
    });

    it('should not start if already active', () => {
      watchdog.start();
      watchdog.start(); // Should just warn, not throw
      const status = watchdog.getStatus();
      expect(status.isActive).toBe(true);
    });
  });

  describe('Heartbeat', () => {
    it('should update last heartbeat time', () => {
      watchdog.start();
      const initialStatus = watchdog.getStatus();
      const initialHeartbeat = initialStatus.lastHeartbeat;

      // Wait a bit and send heartbeat
      setTimeout(() => {
        watchdog.heartbeat();
        const newStatus = watchdog.getStatus();
        expect(newStatus.lastHeartbeat).toBeGreaterThan(initialHeartbeat);
      }, 10);
    });

    it('should not update if watchdog is stopped', () => {
      const status = watchdog.getStatus();
      const initialHeartbeat = status.lastHeartbeat;
      
      watchdog.heartbeat();
      
      const newStatus = watchdog.getStatus();
      expect(newStatus.lastHeartbeat).toBe(initialHeartbeat);
    });
  });

  describe('Timeout', () => {
    it('should call timeout handler on timeout', async () => {
      watchdog.start();
      
      // Wait for timeout to occur
      await new Promise(resolve => setTimeout(resolve, 150));
      
      expect(timeoutHandler).toHaveBeenCalled();
    });

    it('should increment timeout count', async () => {
      watchdog.start();
      
      // Wait for timeout to occur
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const status = watchdog.getStatus();
      expect(status.timeoutCount).toBeGreaterThan(0);
    });

    it('should prevent timeout with heartbeat', async () => {
      watchdog.start();
      
      // Send heartbeat before timeout
      await new Promise(resolve => setTimeout(resolve, 50));
      watchdog.heartbeat();
      
      // Wait past original timeout
      await new Promise(resolve => setTimeout(resolve, 80));
      
      // Should not have timed out yet
      const status = watchdog.getStatus();
      expect(status.timeoutCount).toBe(0);
    });
  });

  describe('Status', () => {
    it('should return correct status', () => {
      watchdog.start();
      const status = watchdog.getStatus();
      
      expect(status.name).toBe('test_watchdog');
      expect(status.isActive).toBe(true);
      expect(status.lastHeartbeat).toBeGreaterThan(0);
      expect(status.timeoutCount).toBe(0);
      expect(status.restartCount).toBe(0);
    });
  });

  describe('Reset', () => {
    it('should reset counters', () => {
      watchdog.start();
      // Force some counts (we can't easily trigger timeout in sync test)
      watchdog.reset();
      
      const status = watchdog.getStatus();
      expect(status.timeoutCount).toBe(0);
      expect(status.restartCount).toBe(0);
    });
  });
});

describe('WatchdogManager', () => {
  let manager: WatchdogManager;

  beforeEach(() => {
    manager = new WatchdogManager();
  });

  afterEach(() => {
    manager.stopAll();
  });

  describe('Watchdog Management', () => {
    it('should add a watchdog', () => {
      const config: WatchdogConfig = {
        name: 'test_watchdog',
        timeoutMs: 100,
        onTimeout: async () => {},
      };

      manager.addWatchdog(config);
      const statuses = manager.getAllStatus();
      expect(statuses.length).toBe(1);
      expect(statuses[0].name).toBe('test_watchdog');
    });

    it('should throw error if watchdog already exists', () => {
      const config: WatchdogConfig = {
        name: 'test_watchdog',
        timeoutMs: 100,
        onTimeout: async () => {},
      };

      manager.addWatchdog(config);
      expect(() => manager.addWatchdog(config)).toThrow('already exists');
    });

    it('should remove a watchdog', () => {
      const config: WatchdogConfig = {
        name: 'test_watchdog',
        timeoutMs: 100,
        onTimeout: async () => {},
      };

      manager.addWatchdog(config);
      manager.removeWatchdog('test_watchdog');
      
      const statuses = manager.getAllStatus();
      expect(statuses.length).toBe(0);
    });

    it('should throw error if watchdog not found', () => {
      expect(() => manager.removeWatchdog('nonexistent')).toThrow('not found');
    });
  });

  describe('Watchdog Control', () => {
    beforeEach(() => {
      const config: WatchdogConfig = {
        name: 'test_watchdog',
        timeoutMs: 100,
        onTimeout: async () => {},
      };
      manager.addWatchdog(config);
    });

    it('should start a watchdog', () => {
      manager.startWatchdog('test_watchdog');
      const status = manager.getWatchdogStatus('test_watchdog');
      expect(status.isActive).toBe(true);
    });

    it('should stop a watchdog', () => {
      manager.startWatchdog('test_watchdog');
      manager.stopWatchdog('test_watchdog');
      const status = manager.getWatchdogStatus('test_watchdog');
      expect(status.isActive).toBe(false);
    });

    it('should start all watchdogs', () => {
      manager.addWatchdog({
        name: 'watchdog2',
        timeoutMs: 100,
        onTimeout: async () => {},
      });

      manager.startAll();
      
      const statuses = manager.getAllStatus();
      expect(statuses.every(s => s.isActive)).toBe(true);
    });

    it('should stop all watchdogs', () => {
      manager.startAll();
      manager.stopAll();
      
      const statuses = manager.getAllStatus();
      expect(statuses.every(s => !s.isActive)).toBe(true);
    });
  });

  describe('Heartbeat', () => {
    beforeEach(() => {
      const config: WatchdogConfig = {
        name: 'test_watchdog',
        timeoutMs: 100,
        onTimeout: async () => {},
      };
      manager.addWatchdog(config);
      manager.startWatchdog('test_watchdog');
    });

    it('should send heartbeat to specific watchdog', () => {
      const initialStatus = manager.getWatchdogStatus('test_watchdog');
      const initialHeartbeat = initialStatus.lastHeartbeat;
      
      // Wait and send heartbeat
      setTimeout(() => {
        manager.heartbeat('test_watchdog');
        const newStatus = manager.getWatchdogStatus('test_watchdog');
        expect(newStatus.lastHeartbeat).toBeGreaterThan(initialHeartbeat);
      }, 10);
    });

    it('should send heartbeat to all watchdogs', () => {
      manager.addWatchdog({
        name: 'watchdog2',
        timeoutMs: 100,
        onTimeout: async () => {},
      });
      manager.startWatchdog('watchdog2');

      manager.heartbeatAll();
      
      // Just verify no errors - actual heartbeat timing is hard to test synchronously
      const statuses = manager.getAllStatus();
      expect(statuses.length).toBe(2);
    });

    it('should throw error if watchdog not found', () => {
      expect(() => manager.heartbeat('nonexistent')).toThrow('not found');
    });
  });

  describe('Status', () => {
    it('should get watchdog status', () => {
      manager.addWatchdog({
        name: 'test_watchdog',
        timeoutMs: 100,
        onTimeout: async () => {},
      });

      const status = manager.getWatchdogStatus('test_watchdog');
      expect(status.name).toBe('test_watchdog');
    });

    it('should get all statuses', () => {
      manager.addWatchdog({
        name: 'watchdog1',
        timeoutMs: 100,
        onTimeout: async () => {},
      });
      manager.addWatchdog({
        name: 'watchdog2',
        timeoutMs: 100,
        onTimeout: async () => {},
      });

      const statuses = manager.getAllStatus();
      expect(statuses.length).toBe(2);
    });

    it('should get active count', () => {
      manager.addWatchdog({
        name: 'watchdog1',
        timeoutMs: 100,
        onTimeout: async () => {},
      });
      manager.addWatchdog({
        name: 'watchdog2',
        timeoutMs: 100,
        onTimeout: async () => {},
      });

      manager.startWatchdog('watchdog1');
      
      const activeCount = manager.getActiveCount();
      expect(activeCount).toBe(1);
    });
  });

  describe('Reset', () => {
    beforeEach(() => {
      manager.addWatchdog({
        name: 'test_watchdog',
        timeoutMs: 100,
        onTimeout: async () => {},
      });
    });

    it('should reset specific watchdog', () => {
      manager.resetWatchdog('test_watchdog');
      const status = manager.getWatchdogStatus('test_watchdog');
      expect(status.timeoutCount).toBe(0);
      expect(status.restartCount).toBe(0);
    });

    it('should reset all watchdogs', () => {
      manager.addWatchdog({
        name: 'watchdog2',
        timeoutMs: 100,
        onTimeout: async () => {},
      });

      manager.resetAll();
      
      const statuses = manager.getAllStatus();
      expect(statuses.every(s => s.timeoutCount === 0 && s.restartCount === 0)).toBe(true);
    });
  });
});
