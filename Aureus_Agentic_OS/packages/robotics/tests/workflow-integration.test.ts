/**
 * Tests for workflow integration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SafetyGate,
  WorkflowOverrideController,
  RobotWorkflowExecutor,
} from '../src/workflow-integration';
import { SafetyEnvelope } from '../src/safety-envelope';
import { EmergencyStopTrigger } from '../src/emergency-stop';
import { WatchdogManager } from '../src/watchdog';
import { PhysicalLimits, RobotState } from '../src/types';

describe('SafetyGate', () => {
  let safetyGate: SafetyGate;
  let safetyEnvelope: SafetyEnvelope;
  let emergencyStop: EmergencyStopTrigger;
  let limits: PhysicalLimits;

  beforeEach(() => {
    emergencyStop = new EmergencyStopTrigger();
    limits = {
      position: [-1.0, 1.0, -1.0, 1.0, 0.0, 2.0],
      velocity: [1.0, 0.5],
      acceleration: [2.0, 1.0],
    };
    safetyEnvelope = new SafetyEnvelope(limits, emergencyStop);
    safetyGate = new SafetyGate(safetyEnvelope, emergencyStop);
  });

  describe('Execution Permission', () => {
    it('should allow execution when safe', async () => {
      const state: RobotState = {
        position: [0.5, 0.5, 1.0],
        orientation: [0.0, 0.0, 0.0],
        velocity: [0.5, 0.2],
        acceleration: [1.0, 0.5],
        timestamp: Date.now(),
      };

      const result = await safetyGate.canExecute(state);
      expect(result.allowed).toBe(true);
    });

    it('should block execution on critical violation', async () => {
      const state: RobotState = {
        position: [2.0, 0.5, 1.0], // Exceeds position limit
        orientation: [0.0, 0.0, 0.0],
        velocity: [0.5, 0.2],
        acceleration: [1.0, 0.5],
        timestamp: Date.now(),
      };

      const result = await safetyGate.canExecute(state);
      expect(result.allowed).toBe(false);
      expect(result.reason).toBeDefined();
      expect(result.violations).toBeDefined();
    });

    it('should block execution in emergency stop', async () => {
      await emergencyStop.triggerManual('Test stop');

      const state: RobotState = {
        position: [0.5, 0.5, 1.0],
        orientation: [0.0, 0.0, 0.0],
        velocity: [0.5, 0.2],
        acceleration: [1.0, 0.5],
        timestamp: Date.now(),
      };

      const result = await safetyGate.canExecute(state);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('emergency stop');
    });

    it('should allow execution with warnings', async () => {
      const state: RobotState = {
        position: [0.95, 0.5, 1.0], // Close to limit, warning only
        orientation: [0.0, 0.0, 0.0],
        velocity: [0.5, 0.2],
        acceleration: [1.0, 0.5],
        timestamp: Date.now(),
      };

      const result = await safetyGate.canExecute(state);
      expect(result.allowed).toBe(true);
      expect(result.violations).toBeDefined();
      expect(result.violations!.some(v => v.severity === 'warning')).toBe(true);
    });
  });
});

describe('WorkflowOverrideController', () => {
  let controller: WorkflowOverrideController;
  let safetyGate: SafetyGate;
  let safetyEnvelope: SafetyEnvelope;
  let emergencyStop: EmergencyStopTrigger;
  let watchdogManager: WatchdogManager;
  let limits: PhysicalLimits;

  beforeEach(() => {
    emergencyStop = new EmergencyStopTrigger();
    watchdogManager = new WatchdogManager();
    limits = {
      position: [-1.0, 1.0, -1.0, 1.0, 0.0, 2.0],
      velocity: [1.0, 0.5],
      acceleration: [2.0, 1.0],
    };
    safetyEnvelope = new SafetyEnvelope(limits, emergencyStop);
    safetyGate = new SafetyGate(safetyEnvelope, emergencyStop);
    controller = new WorkflowOverrideController(safetyGate, watchdogManager, emergencyStop);
  });

  describe('Override Callbacks', () => {
    it('should register override callback', () => {
      const callback = vi.fn();
      controller.registerOverrideCallback(callback);
      // No direct verification, but should not throw
    });

    it('should remove override callback', () => {
      const callback = vi.fn();
      controller.registerOverrideCallback(callback);
      controller.removeOverrideCallback(callback);
      // No direct verification, but should not throw
    });

    it('should call callbacks on override', async () => {
      const callback = vi.fn();
      controller.registerOverrideCallback(callback);

      await controller.triggerOverride('Test override');

      expect(callback).toHaveBeenCalledWith('Test override');
    });

    it('should call multiple callbacks', async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      
      controller.registerOverrideCallback(callback1);
      controller.registerOverrideCallback(callback2);

      await controller.triggerOverride('Test override');

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('should handle callback errors gracefully', async () => {
      const errorCallback = vi.fn().mockRejectedValue(new Error('Callback error'));
      const goodCallback = vi.fn();
      
      controller.registerOverrideCallback(errorCallback);
      controller.registerOverrideCallback(goodCallback);

      await expect(controller.triggerOverride('Test override')).resolves.not.toThrow();
      expect(errorCallback).toHaveBeenCalled();
      expect(goodCallback).toHaveBeenCalled();
    });
  });

  describe('Execution Control', () => {
    it('should allow execution when safe', async () => {
      const state: RobotState = {
        position: [0.5, 0.5, 1.0],
        orientation: [0.0, 0.0, 0.0],
        velocity: [0.5, 0.2],
        acceleration: [1.0, 0.5],
        timestamp: Date.now(),
      };

      const result = await controller.shouldAllowExecution(state);
      expect(result.allowed).toBe(true);
    });

    it('should block execution and trigger override on violation', async () => {
      const callback = vi.fn();
      controller.registerOverrideCallback(callback);

      const state: RobotState = {
        position: [2.0, 0.5, 1.0], // Exceeds limit
        orientation: [0.0, 0.0, 0.0],
        velocity: [0.5, 0.2],
        acceleration: [1.0, 0.5],
        timestamp: Date.now(),
      };

      const result = await controller.shouldAllowExecution(state);
      expect(result.allowed).toBe(false);
      expect(callback).toHaveBeenCalled();
    });
  });

  describe('Emergency Stop Integration', () => {
    it('should trigger override on emergency stop', async () => {
      const callback = vi.fn();
      controller.registerOverrideCallback(callback);

      await emergencyStop.triggerManual('Test stop');

      // Wait for async handler
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('Component Access', () => {
    it('should get safety gate', () => {
      const gate = controller.getSafetyGate();
      expect(gate).toBe(safetyGate);
    });

    it('should get watchdog manager', () => {
      const manager = controller.getWatchdogManager();
      expect(manager).toBe(watchdogManager);
    });

    it('should get emergency stop', () => {
      const trigger = controller.getEmergencyStop();
      expect(trigger).toBe(emergencyStop);
    });
  });
});

describe('RobotWorkflowExecutor', () => {
  let executor: RobotWorkflowExecutor;
  let controller: WorkflowOverrideController;
  let safetyGate: SafetyGate;
  let safetyEnvelope: SafetyEnvelope;
  let emergencyStop: EmergencyStopTrigger;
  let watchdogManager: WatchdogManager;
  let limits: PhysicalLimits;

  beforeEach(() => {
    emergencyStop = new EmergencyStopTrigger();
    watchdogManager = new WatchdogManager();
    limits = {
      position: [-1.0, 1.0, -1.0, 1.0, 0.0, 2.0],
      velocity: [1.0, 0.5],
      acceleration: [2.0, 1.0],
    };
    safetyEnvelope = new SafetyEnvelope(limits, emergencyStop);
    safetyGate = new SafetyGate(safetyEnvelope, emergencyStop);
    controller = new WorkflowOverrideController(safetyGate, watchdogManager, emergencyStop);
    executor = new RobotWorkflowExecutor(controller);
  });

  describe('Step Execution', () => {
    it('should execute step when safe', async () => {
      const stepFn = vi.fn();
      const state: RobotState = {
        position: [0.5, 0.5, 1.0],
        orientation: [0.0, 0.0, 0.0],
        velocity: [0.5, 0.2],
        acceleration: [1.0, 0.5],
        timestamp: Date.now(),
      };

      const result = await executor.executeStep('test_step', stepFn, state);

      expect(result.success).toBe(true);
      expect(stepFn).toHaveBeenCalled();
    });

    it('should block step when unsafe', async () => {
      const stepFn = vi.fn();
      const state: RobotState = {
        position: [2.0, 0.5, 1.0], // Exceeds limit
        orientation: [0.0, 0.0, 0.0],
        velocity: [0.5, 0.2],
        acceleration: [1.0, 0.5],
        timestamp: Date.now(),
      };

      const result = await executor.executeStep('test_step', stepFn, state);

      expect(result.success).toBe(false);
      expect(result.overridden).toBe(true);
      expect(stepFn).not.toHaveBeenCalled();
    });

    it('should handle step errors', async () => {
      const stepFn = vi.fn().mockRejectedValue(new Error('Step error'));
      const state: RobotState = {
        position: [0.5, 0.5, 1.0],
        orientation: [0.0, 0.0, 0.0],
        velocity: [0.5, 0.2],
        acceleration: [1.0, 0.5],
        timestamp: Date.now(),
      };

      const result = await executor.executeStep('test_step', stepFn, state);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Step error');
      expect(result.overridden).toBeUndefined();
    });
  });

  describe('Workflow Execution', () => {
    it('should execute all steps when safe', async () => {
      const step1 = vi.fn();
      const step2 = vi.fn();
      const getState = vi.fn().mockResolvedValue({
        position: [0.5, 0.5, 1.0],
        orientation: [0.0, 0.0, 0.0],
        velocity: [0.5, 0.2],
        acceleration: [1.0, 0.5],
        timestamp: Date.now(),
      });

      const result = await executor.executeWorkflow('test_workflow', [
        { name: 'step1', fn: step1, getRobotState: getState },
        { name: 'step2', fn: step2, getRobotState: getState },
      ]);

      expect(result.success).toBe(true);
      expect(result.completedSteps).toBe(2);
      expect(result.totalSteps).toBe(2);
      expect(step1).toHaveBeenCalled();
      expect(step2).toHaveBeenCalled();
    });

    it('should stop workflow on override', async () => {
      const step1 = vi.fn();
      const step2 = vi.fn();
      const getState = vi.fn()
        .mockResolvedValueOnce({
          position: [0.5, 0.5, 1.0],
          orientation: [0.0, 0.0, 0.0],
          velocity: [0.5, 0.2],
          acceleration: [1.0, 0.5],
          timestamp: Date.now(),
        })
        .mockResolvedValueOnce({
          position: [2.0, 0.5, 1.0], // Exceeds limit
          orientation: [0.0, 0.0, 0.0],
          velocity: [0.5, 0.2],
          acceleration: [1.0, 0.5],
          timestamp: Date.now(),
        });

      const result = await executor.executeWorkflow('test_workflow', [
        { name: 'step1', fn: step1, getRobotState: getState },
        { name: 'step2', fn: step2, getRobotState: getState },
      ]);

      expect(result.success).toBe(false);
      expect(result.completedSteps).toBe(1);
      expect(result.totalSteps).toBe(2);
      expect(step1).toHaveBeenCalled();
      expect(step2).not.toHaveBeenCalled();
    });

    it('should continue workflow on non-override errors', async () => {
      const step1 = vi.fn().mockRejectedValue(new Error('Step error'));
      const step2 = vi.fn();
      const getState = vi.fn().mockResolvedValue({
        position: [0.5, 0.5, 1.0],
        orientation: [0.0, 0.0, 0.0],
        velocity: [0.5, 0.2],
        acceleration: [1.0, 0.5],
        timestamp: Date.now(),
      });

      const result = await executor.executeWorkflow('test_workflow', [
        { name: 'step1', fn: step1, getRobotState: getState },
        { name: 'step2', fn: step2, getRobotState: getState },
      ]);

      expect(result.success).toBe(false);
      expect(result.completedSteps).toBe(1); // only step2 completed successfully
      expect(result.totalSteps).toBe(2);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBe(1);
    });

    it('should collect all errors', async () => {
      const step1 = vi.fn().mockRejectedValue(new Error('Error 1'));
      const step2 = vi.fn().mockRejectedValue(new Error('Error 2'));
      const getState = vi.fn().mockResolvedValue({
        position: [0.5, 0.5, 1.0],
        orientation: [0.0, 0.0, 0.0],
        velocity: [0.5, 0.2],
        acceleration: [1.0, 0.5],
        timestamp: Date.now(),
      });

      const result = await executor.executeWorkflow('test_workflow', [
        { name: 'step1', fn: step1, getRobotState: getState },
        { name: 'step2', fn: step2, getRobotState: getState },
      ]);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBe(2);
    });
  });

  describe('Controller Access', () => {
    it('should get override controller', () => {
      const retrievedController = executor.getOverrideController();
      expect(retrievedController).toBe(controller);
    });
  });
});
