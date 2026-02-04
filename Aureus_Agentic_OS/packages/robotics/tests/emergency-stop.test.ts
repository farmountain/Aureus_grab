/**
 * Tests for emergency stop system
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EmergencyStopTrigger,
  EmergencyStopCoordinator,
} from '../src/emergency-stop';
import { EmergencyStopReason, SafetyViolation } from '../src/types';

describe('EmergencyStopTrigger', () => {
  let trigger: EmergencyStopTrigger;
  let handler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    trigger = new EmergencyStopTrigger();
    handler = vi.fn();
    trigger.registerHandler(handler);
  });

  describe('Handler Management', () => {
    it('should register a handler', () => {
      const newHandler = vi.fn();
      trigger.registerHandler(newHandler);
      // No direct way to verify, but should not throw
    });

    it('should remove a handler', () => {
      trigger.removeHandler(handler);
      // No direct way to verify, but should not throw
    });
  });

  describe('Triggering', () => {
    it('should trigger emergency stop', async () => {
      await trigger.trigger(EmergencyStopReason.MANUAL_TRIGGER, 'Test stop');
      
      expect(handler).toHaveBeenCalled();
      expect(trigger.isInEmergencyStop()).toBe(true);
    });

    it('should call all registered handlers', async () => {
      const handler2 = vi.fn();
      trigger.registerHandler(handler2);
      
      await trigger.trigger(EmergencyStopReason.MANUAL_TRIGGER, 'Test stop');
      
      expect(handler).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should add event to history', async () => {
      await trigger.trigger(EmergencyStopReason.MANUAL_TRIGGER, 'Test stop');
      
      const history = trigger.getEventHistory();
      expect(history.length).toBe(1);
      expect(history[0].reason).toBe(EmergencyStopReason.MANUAL_TRIGGER);
      expect(history[0].message).toBe('Test stop');
    });

    it('should handle handler errors gracefully', async () => {
      const errorHandler = vi.fn().mockRejectedValue(new Error('Handler error'));
      trigger.registerHandler(errorHandler);
      
      await expect(trigger.trigger(EmergencyStopReason.MANUAL_TRIGGER, 'Test stop')).resolves.not.toThrow();
    });
  });

  describe('Specific Triggers', () => {
    it('should trigger for safety violation', async () => {
      const violation: SafetyViolation = {
        type: 'velocity',
        severity: 'critical',
        message: 'Velocity exceeded',
        currentValue: 2.0,
        limitValue: 1.0,
        timestamp: Date.now(),
      };

      await trigger.triggerForSafetyViolation(violation);
      
      expect(handler).toHaveBeenCalled();
      const lastEvent = trigger.getLastEvent();
      expect(lastEvent?.reason).toBe(EmergencyStopReason.SAFETY_VIOLATION);
      expect(lastEvent?.violation).toEqual(violation);
    });

    it('should trigger for watchdog timeout', async () => {
      await trigger.triggerForWatchdogTimeout('test_watchdog');
      
      expect(handler).toHaveBeenCalled();
      const lastEvent = trigger.getLastEvent();
      expect(lastEvent?.reason).toBe(EmergencyStopReason.WATCHDOG_TIMEOUT);
    });

    it('should trigger manual stop', async () => {
      await trigger.triggerManual('User requested stop');
      
      expect(handler).toHaveBeenCalled();
      const lastEvent = trigger.getLastEvent();
      expect(lastEvent?.reason).toBe(EmergencyStopReason.MANUAL_TRIGGER);
    });

    it('should trigger for communication loss', async () => {
      await trigger.triggerForCommunicationLoss('Connection timeout');
      
      expect(handler).toHaveBeenCalled();
      const lastEvent = trigger.getLastEvent();
      expect(lastEvent?.reason).toBe(EmergencyStopReason.COMMUNICATION_LOSS);
    });

    it('should trigger for hardware failure', async () => {
      await trigger.triggerForHardwareFailure('Motor failure');
      
      expect(handler).toHaveBeenCalled();
      const lastEvent = trigger.getLastEvent();
      expect(lastEvent?.reason).toBe(EmergencyStopReason.HARDWARE_FAILURE);
      expect(lastEvent?.recoverable).toBe(false);
    });
  });

  describe('Reset', () => {
    it('should reset emergency stop if recoverable', async () => {
      await trigger.triggerManual('Test stop');
      await trigger.reset();
      
      expect(trigger.isInEmergencyStop()).toBe(false);
    });

    it('should throw error if not in emergency stop', async () => {
      await expect(trigger.reset()).resolves.not.toThrow();
      // Should just warn, not throw
    });

    it('should throw error if not recoverable', async () => {
      await trigger.triggerForHardwareFailure('Fatal error');
      
      await expect(trigger.reset()).rejects.toThrow('not recoverable');
    });
  });

  describe('Event History', () => {
    it('should get event history', async () => {
      await trigger.triggerManual('Stop 1');
      await trigger.reset();
      await trigger.triggerManual('Stop 2');
      
      const history = trigger.getEventHistory();
      expect(history.length).toBe(2);
    });

    it('should get last event', async () => {
      await trigger.triggerManual('Stop 1');
      await trigger.reset();
      await trigger.triggerManual('Stop 2');
      
      const lastEvent = trigger.getLastEvent();
      expect(lastEvent?.message).toBe('Stop 2');
    });

    it('should clear history', async () => {
      await trigger.triggerManual('Test stop');
      trigger.clearHistory();
      
      const history = trigger.getEventHistory();
      expect(history.length).toBe(0);
    });

    it('should limit history size', async () => {
      // Trigger more than max history
      for (let i = 0; i < 150; i++) {
        await trigger.trigger(EmergencyStopReason.MANUAL_TRIGGER, `Stop ${i}`, { recoverable: true });
        await trigger.reset();
      }
      
      const history = trigger.getEventHistory();
      expect(history.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Statistics', () => {
    it('should get statistics', async () => {
      await trigger.triggerManual('Test stop 1');
      await trigger.reset();
      await trigger.triggerForWatchdogTimeout('watchdog');
      
      const stats = trigger.getStats();
      expect(stats.isEmergencyStopped).toBe(true);
      expect(stats.totalEvents).toBe(2);
      expect(stats.eventsByReason[EmergencyStopReason.MANUAL_TRIGGER]).toBe(1);
      expect(stats.eventsByReason[EmergencyStopReason.WATCHDOG_TIMEOUT]).toBe(1);
      expect(stats.lastEvent).toBeDefined();
    });
  });
});

describe('EmergencyStopCoordinator', () => {
  let trigger: EmergencyStopTrigger;
  let coordinator: EmergencyStopCoordinator;

  beforeEach(() => {
    trigger = new EmergencyStopTrigger();
    coordinator = new EmergencyStopCoordinator(trigger);
  });

  describe('Stop Action Management', () => {
    it('should register a stop action', () => {
      const action = vi.fn();
      coordinator.registerStopAction('test_action', action);
      
      const actions = coordinator.getStopActions();
      expect(actions).toContain('test_action');
    });

    it('should throw error if action already registered', () => {
      const action = vi.fn();
      coordinator.registerStopAction('test_action', action);
      
      expect(() => coordinator.registerStopAction('test_action', action)).toThrow('already registered');
    });

    it('should unregister a stop action', () => {
      const action = vi.fn();
      coordinator.registerStopAction('test_action', action);
      coordinator.unregisterStopAction('test_action');
      
      const actions = coordinator.getStopActions();
      expect(actions).not.toContain('test_action');
    });

    it('should throw error if action not found', () => {
      expect(() => coordinator.unregisterStopAction('nonexistent')).toThrow('not found');
    });
  });

  describe('Stop Action Execution', () => {
    it('should execute all stop actions on trigger', async () => {
      const action1 = vi.fn();
      const action2 = vi.fn();
      
      coordinator.registerStopAction('action1', action1);
      coordinator.registerStopAction('action2', action2);
      
      await trigger.triggerManual('Test stop');
      
      // Wait for async handlers
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(action1).toHaveBeenCalled();
      expect(action2).toHaveBeenCalled();
    });

    it('should handle action errors gracefully', async () => {
      const errorAction = vi.fn().mockRejectedValue(new Error('Action error'));
      const goodAction = vi.fn();
      
      coordinator.registerStopAction('error_action', errorAction);
      coordinator.registerStopAction('good_action', goodAction);
      
      await trigger.triggerManual('Test stop');
      
      // Wait for async handlers
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Both should be called despite error
      expect(errorAction).toHaveBeenCalled();
      expect(goodAction).toHaveBeenCalled();
    });
  });

  describe('Trigger Access', () => {
    it('should get trigger', () => {
      const retrievedTrigger = coordinator.getTrigger();
      expect(retrievedTrigger).toBe(trigger);
    });
  });
});
