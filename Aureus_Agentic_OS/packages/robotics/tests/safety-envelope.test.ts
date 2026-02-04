/**
 * Tests for safety envelope system
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SafetyEnvelope } from '../src/safety-envelope';
import { EmergencyStopTrigger } from '../src/emergency-stop';
import { PhysicalLimits, RobotState } from '../src/types';

describe('SafetyEnvelope', () => {
  let safetyEnvelope: SafetyEnvelope;
  let emergencyStop: EmergencyStopTrigger;
  let limits: PhysicalLimits;

  beforeEach(() => {
    emergencyStop = new EmergencyStopTrigger();
    limits = {
      position: [-1.0, 1.0, -1.0, 1.0, 0.0, 2.0],
      velocity: [1.0, 0.5],
      acceleration: [2.0, 1.0],
      force: 100,
      torque: 50,
      temperature: [10, 80],
    };
    safetyEnvelope = new SafetyEnvelope(limits, emergencyStop);
  });

  describe('Position Limits', () => {
    it('should pass for position within limits', async () => {
      const state: RobotState = {
        position: [0.5, 0.5, 1.0],
        orientation: [0.0, 0.0, 0.0],
        velocity: [0.0, 0.0],
        acceleration: [0.0, 0.0],
        timestamp: Date.now(),
      };

      const { safe, violations } = await safetyEnvelope.checkState(state);
      expect(safe).toBe(true);
      expect(violations.filter(v => v.severity === 'critical')).toHaveLength(0);
    });

    it('should detect X position violation', async () => {
      const state: RobotState = {
        position: [1.5, 0.5, 1.0], // X exceeds max
        orientation: [0.0, 0.0, 0.0],
        velocity: [0.0, 0.0],
        acceleration: [0.0, 0.0],
        timestamp: Date.now(),
      };

      const { safe, violations } = await safetyEnvelope.checkState(state);
      expect(safe).toBe(false);
      expect(violations.some(v => v.type === 'position' && v.severity === 'critical')).toBe(true);
    });

    it('should detect Y position violation', async () => {
      const state: RobotState = {
        position: [0.5, -1.5, 1.0], // Y below min
        orientation: [0.0, 0.0, 0.0],
        velocity: [0.0, 0.0],
        acceleration: [0.0, 0.0],
        timestamp: Date.now(),
      };

      const { safe, violations } = await safetyEnvelope.checkState(state);
      expect(safe).toBe(false);
      expect(violations.some(v => v.type === 'position' && v.severity === 'critical')).toBe(true);
    });

    it('should detect Z position violation', async () => {
      const state: RobotState = {
        position: [0.5, 0.5, 2.5], // Z exceeds max
        orientation: [0.0, 0.0, 0.0],
        velocity: [0.0, 0.0],
        acceleration: [0.0, 0.0],
        timestamp: Date.now(),
      };

      const { safe, violations } = await safetyEnvelope.checkState(state);
      expect(safe).toBe(false);
      expect(violations.some(v => v.type === 'position' && v.severity === 'critical')).toBe(true);
    });

    it('should warn when approaching position limits', async () => {
      const state: RobotState = {
        position: [0.95, 0.5, 1.0], // Close to X max
        orientation: [0.0, 0.0, 0.0],
        velocity: [0.0, 0.0],
        acceleration: [0.0, 0.0],
        timestamp: Date.now(),
      };

      const { safe, violations } = await safetyEnvelope.checkState(state);
      expect(safe).toBe(true); // No critical violations
      expect(violations.some(v => v.type === 'position' && v.severity === 'warning')).toBe(true);
    });
  });

  describe('Velocity Limits', () => {
    it('should pass for velocity within limits', async () => {
      const state: RobotState = {
        position: [0.5, 0.5, 1.0],
        orientation: [0.0, 0.0, 0.0],
        velocity: [0.5, 0.2],
        acceleration: [0.0, 0.0],
        timestamp: Date.now(),
      };

      const { safe, violations } = await safetyEnvelope.checkState(state);
      expect(safe).toBe(true);
      expect(violations.filter(v => v.severity === 'critical')).toHaveLength(0);
    });

    it('should detect linear velocity violation', async () => {
      const state: RobotState = {
        position: [0.5, 0.5, 1.0],
        orientation: [0.0, 0.0, 0.0],
        velocity: [1.5, 0.2], // Linear velocity exceeds limit
        acceleration: [0.0, 0.0],
        timestamp: Date.now(),
      };

      const { safe, violations } = await safetyEnvelope.checkState(state);
      expect(safe).toBe(false);
      expect(violations.some(v => v.type === 'velocity' && v.severity === 'critical')).toBe(true);
    });

    it('should detect angular velocity violation', async () => {
      const state: RobotState = {
        position: [0.5, 0.5, 1.0],
        orientation: [0.0, 0.0, 0.0],
        velocity: [0.5, 0.8], // Angular velocity exceeds limit
        acceleration: [0.0, 0.0],
        timestamp: Date.now(),
      };

      const { safe, violations } = await safetyEnvelope.checkState(state);
      expect(safe).toBe(false);
      expect(violations.some(v => v.type === 'velocity' && v.severity === 'critical')).toBe(true);
    });

    it('should warn when approaching velocity limits', async () => {
      const state: RobotState = {
        position: [0.5, 0.5, 1.0],
        orientation: [0.0, 0.0, 0.0],
        velocity: [0.95, 0.2], // Close to linear velocity limit
        acceleration: [0.0, 0.0],
        timestamp: Date.now(),
      };

      const { safe, violations } = await safetyEnvelope.checkState(state);
      expect(safe).toBe(true);
      expect(violations.some(v => v.type === 'velocity' && v.severity === 'warning')).toBe(true);
    });
  });

  describe('Acceleration Limits', () => {
    it('should pass for acceleration within limits', async () => {
      const state: RobotState = {
        position: [0.5, 0.5, 1.0],
        orientation: [0.0, 0.0, 0.0],
        velocity: [0.5, 0.2],
        acceleration: [1.0, 0.5],
        timestamp: Date.now(),
      };

      const { safe, violations } = await safetyEnvelope.checkState(state);
      expect(safe).toBe(true);
      expect(violations.filter(v => v.severity === 'critical')).toHaveLength(0);
    });

    it('should detect linear acceleration violation', async () => {
      const state: RobotState = {
        position: [0.5, 0.5, 1.0],
        orientation: [0.0, 0.0, 0.0],
        velocity: [0.5, 0.2],
        acceleration: [2.5, 0.5], // Linear acceleration exceeds limit
        timestamp: Date.now(),
      };

      const { safe, violations } = await safetyEnvelope.checkState(state);
      expect(safe).toBe(false);
      expect(violations.some(v => v.type === 'acceleration' && v.severity === 'critical')).toBe(true);
    });

    it('should detect angular acceleration violation', async () => {
      const state: RobotState = {
        position: [0.5, 0.5, 1.0],
        orientation: [0.0, 0.0, 0.0],
        velocity: [0.5, 0.2],
        acceleration: [1.0, 1.5], // Angular acceleration exceeds limit
        timestamp: Date.now(),
      };

      const { safe, violations } = await safetyEnvelope.checkState(state);
      expect(safe).toBe(false);
      expect(violations.some(v => v.type === 'acceleration' && v.severity === 'critical')).toBe(true);
    });
  });

  describe('Force Limits', () => {
    it('should pass for force within limits', async () => {
      const state: RobotState = {
        position: [0.5, 0.5, 1.0],
        orientation: [0.0, 0.0, 0.0],
        velocity: [0.5, 0.2],
        acceleration: [1.0, 0.5],
        force: 50,
        timestamp: Date.now(),
      };

      const { safe, violations } = await safetyEnvelope.checkState(state);
      expect(safe).toBe(true);
      expect(violations.filter(v => v.severity === 'critical')).toHaveLength(0);
    });

    it('should detect force violation', async () => {
      const state: RobotState = {
        position: [0.5, 0.5, 1.0],
        orientation: [0.0, 0.0, 0.0],
        velocity: [0.5, 0.2],
        acceleration: [1.0, 0.5],
        force: 150, // Exceeds limit
        timestamp: Date.now(),
      };

      const { safe, violations } = await safetyEnvelope.checkState(state);
      expect(safe).toBe(false);
      expect(violations.some(v => v.type === 'force' && v.severity === 'critical')).toBe(true);
    });
  });

  describe('Torque Limits', () => {
    it('should pass for torque within limits', async () => {
      const state: RobotState = {
        position: [0.5, 0.5, 1.0],
        orientation: [0.0, 0.0, 0.0],
        velocity: [0.5, 0.2],
        acceleration: [1.0, 0.5],
        torque: 25,
        timestamp: Date.now(),
      };

      const { safe, violations } = await safetyEnvelope.checkState(state);
      expect(safe).toBe(true);
      expect(violations.filter(v => v.severity === 'critical')).toHaveLength(0);
    });

    it('should detect torque violation', async () => {
      const state: RobotState = {
        position: [0.5, 0.5, 1.0],
        orientation: [0.0, 0.0, 0.0],
        velocity: [0.5, 0.2],
        acceleration: [1.0, 0.5],
        torque: 75, // Exceeds limit
        timestamp: Date.now(),
      };

      const { safe, violations } = await safetyEnvelope.checkState(state);
      expect(safe).toBe(false);
      expect(violations.some(v => v.type === 'torque' && v.severity === 'critical')).toBe(true);
    });
  });

  describe('Temperature Limits', () => {
    it('should pass for temperature within limits', async () => {
      const state: RobotState = {
        position: [0.5, 0.5, 1.0],
        orientation: [0.0, 0.0, 0.0],
        velocity: [0.5, 0.2],
        acceleration: [1.0, 0.5],
        temperature: 45,
        timestamp: Date.now(),
      };

      const { safe, violations } = await safetyEnvelope.checkState(state);
      expect(safe).toBe(true);
      expect(violations.filter(v => v.severity === 'critical')).toHaveLength(0);
    });

    it('should detect high temperature violation', async () => {
      const state: RobotState = {
        position: [0.5, 0.5, 1.0],
        orientation: [0.0, 0.0, 0.0],
        velocity: [0.5, 0.2],
        acceleration: [1.0, 0.5],
        temperature: 90, // Exceeds max
        timestamp: Date.now(),
      };

      const { safe, violations } = await safetyEnvelope.checkState(state);
      expect(safe).toBe(false);
      expect(violations.some(v => v.type === 'temperature' && v.severity === 'critical')).toBe(true);
    });

    it('should detect low temperature violation', async () => {
      const state: RobotState = {
        position: [0.5, 0.5, 1.0],
        orientation: [0.0, 0.0, 0.0],
        velocity: [0.5, 0.2],
        acceleration: [1.0, 0.5],
        temperature: 5, // Below min
        timestamp: Date.now(),
      };

      const { safe, violations } = await safetyEnvelope.checkState(state);
      expect(safe).toBe(false);
      expect(violations.some(v => v.type === 'temperature' && v.severity === 'critical')).toBe(true);
    });
  });

  describe('Emergency Stop Integration', () => {
    it('should trigger emergency stop on critical violation', async () => {
      const triggerSpy = vi.spyOn(emergencyStop, 'triggerForSafetyViolation');

      const state: RobotState = {
        position: [2.0, 0.5, 1.0], // Critical position violation
        orientation: [0.0, 0.0, 0.0],
        velocity: [0.5, 0.2],
        acceleration: [1.0, 0.5],
        timestamp: Date.now(),
      };

      await safetyEnvelope.checkState(state);
      expect(triggerSpy).toHaveBeenCalled();
    });

    it('should not trigger emergency stop on warnings', async () => {
      const triggerSpy = vi.spyOn(emergencyStop, 'triggerForSafetyViolation');

      const state: RobotState = {
        position: [0.95, 0.5, 1.0], // Warning only
        orientation: [0.0, 0.0, 0.0],
        velocity: [0.5, 0.2],
        acceleration: [1.0, 0.5],
        timestamp: Date.now(),
      };

      await safetyEnvelope.checkState(state);
      expect(triggerSpy).not.toHaveBeenCalled();
    });
  });

  describe('Enable/Disable', () => {
    it('should be enabled by default', () => {
      expect(safetyEnvelope.isEnabled()).toBe(true);
    });

    it('should disable safety checking', async () => {
      safetyEnvelope.disable();
      expect(safetyEnvelope.isEnabled()).toBe(false);

      const state: RobotState = {
        position: [2.0, 0.5, 1.0], // Would normally violate
        orientation: [0.0, 0.0, 0.0],
        velocity: [0.5, 0.2],
        acceleration: [1.0, 0.5],
        timestamp: Date.now(),
      };

      const { safe, violations } = await safetyEnvelope.checkState(state);
      expect(safe).toBe(true);
      expect(violations).toHaveLength(0);
    });

    it('should re-enable safety checking', async () => {
      safetyEnvelope.disable();
      safetyEnvelope.enable();
      expect(safetyEnvelope.isEnabled()).toBe(true);
    });
  });

  describe('Violation History', () => {
    it('should track violation history', async () => {
      const state: RobotState = {
        position: [2.0, 0.5, 1.0],
        orientation: [0.0, 0.0, 0.0],
        velocity: [0.5, 0.2],
        acceleration: [1.0, 0.5],
        timestamp: Date.now(),
      };

      await safetyEnvelope.checkState(state);
      
      const history = safetyEnvelope.getViolationHistory();
      expect(history.length).toBeGreaterThan(0);
    });

    it('should clear violation history', async () => {
      const state: RobotState = {
        position: [2.0, 0.5, 1.0],
        orientation: [0.0, 0.0, 0.0],
        velocity: [0.5, 0.2],
        acceleration: [1.0, 0.5],
        timestamp: Date.now(),
      };

      await safetyEnvelope.checkState(state);
      safetyEnvelope.clearViolationHistory();
      
      const history = safetyEnvelope.getViolationHistory();
      expect(history).toHaveLength(0);
    });
  });

  describe('Limits Management', () => {
    it('should get current limits', () => {
      const currentLimits = safetyEnvelope.getLimits();
      expect(currentLimits).toEqual(limits);
    });

    it('should update limits', () => {
      safetyEnvelope.updateLimits({
        velocity: [0.5, 0.25],
      });

      const updatedLimits = safetyEnvelope.getLimits();
      expect(updatedLimits.velocity).toEqual([0.5, 0.25]);
    });
  });
});
