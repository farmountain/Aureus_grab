/**
 * Safety envelope system
 * 
 * Monitors robot state against physical limits and triggers emergency stops
 * when limits are exceeded. Can override workflow execution to prevent unsafe operations.
 */

import { PhysicalLimits, RobotState, SafetyViolation } from './types';
import { EmergencyStopTrigger } from './emergency-stop';

/**
 * Safety envelope checker
 */
export class SafetyEnvelope {
  private readonly limits: PhysicalLimits;
  private readonly emergencyStop: EmergencyStopTrigger;
  private readonly warningThreshold: number = 0.9; // 90% of limit triggers warning
  private violations: SafetyViolation[] = [];
  private readonly maxViolationHistory: number = 100;
  private enabled: boolean = true;

  constructor(limits: PhysicalLimits, emergencyStop: EmergencyStopTrigger) {
    this.limits = limits;
    this.emergencyStop = emergencyStop;
  }

  /**
   * Check if robot state is within safety envelope
   */
  async checkState(state: RobotState): Promise<{
    safe: boolean;
    violations: SafetyViolation[];
  }> {
    if (!this.enabled) {
      return { safe: true, violations: [] };
    }

    const violations: SafetyViolation[] = [];

    // Check position limits
    if (this.limits.position) {
      const posViolations = this.checkPositionLimits(state);
      violations.push(...posViolations);
    }

    // Check velocity limits
    if (this.limits.velocity) {
      const velViolations = this.checkVelocityLimits(state);
      violations.push(...velViolations);
    }

    // Check acceleration limits
    if (this.limits.acceleration) {
      const accViolations = this.checkAccelerationLimits(state);
      violations.push(...accViolations);
    }

    // Check force limits
    if (this.limits.force !== undefined && state.force !== undefined) {
      const forceViolation = this.checkForceLimit(state);
      if (forceViolation) {
        violations.push(forceViolation);
      }
    }

    // Check torque limits
    if (this.limits.torque !== undefined && state.torque !== undefined) {
      const torqueViolation = this.checkTorqueLimit(state);
      if (torqueViolation) {
        violations.push(torqueViolation);
      }
    }

    // Check temperature limits
    if (this.limits.temperature && state.temperature !== undefined) {
      const tempViolation = this.checkTemperatureLimit(state);
      if (tempViolation) {
        violations.push(tempViolation);
      }
    }

    // Store violations in history
    for (const violation of violations) {
      this.violations.push(violation);
      if (this.violations.length > this.maxViolationHistory) {
        this.violations.shift();
      }

      // Trigger emergency stop for critical violations
      if (violation.severity === 'critical') {
        await this.emergencyStop.triggerForSafetyViolation(violation);
      }
    }

    return {
      safe: violations.filter(v => v.severity === 'critical').length === 0,
      violations,
    };
  }

  /**
   * Check position limits
   */
  private checkPositionLimits(state: RobotState): SafetyViolation[] {
    const violations: SafetyViolation[] = [];
    const [x, y, z] = state.position;
    const [x_min, x_max, y_min, y_max, z_min, z_max] = this.limits.position!;

    // Check X axis
    if (x < x_min || x > x_max) {
      violations.push({
        type: 'position',
        severity: 'critical',
        message: `X position ${x.toFixed(3)}m outside limits [${x_min}, ${x_max}]`,
        currentValue: x,
        limitValue: x < x_min ? x_min : x_max,
        timestamp: state.timestamp,
      });
    } else if (this.isNearLimit(x, x_min, x_max)) {
      violations.push({
        type: 'position',
        severity: 'warning',
        message: `X position ${x.toFixed(3)}m approaching limits [${x_min}, ${x_max}]`,
        currentValue: x,
        limitValue: x < (x_min + x_max) / 2 ? x_min : x_max,
        timestamp: state.timestamp,
      });
    }

    // Check Y axis
    if (y < y_min || y > y_max) {
      violations.push({
        type: 'position',
        severity: 'critical',
        message: `Y position ${y.toFixed(3)}m outside limits [${y_min}, ${y_max}]`,
        currentValue: y,
        limitValue: y < y_min ? y_min : y_max,
        timestamp: state.timestamp,
      });
    } else if (this.isNearLimit(y, y_min, y_max)) {
      violations.push({
        type: 'position',
        severity: 'warning',
        message: `Y position ${y.toFixed(3)}m approaching limits [${y_min}, ${y_max}]`,
        currentValue: y,
        limitValue: y < (y_min + y_max) / 2 ? y_min : y_max,
        timestamp: state.timestamp,
      });
    }

    // Check Z axis
    if (z < z_min || z > z_max) {
      violations.push({
        type: 'position',
        severity: 'critical',
        message: `Z position ${z.toFixed(3)}m outside limits [${z_min}, ${z_max}]`,
        currentValue: z,
        limitValue: z < z_min ? z_min : z_max,
        timestamp: state.timestamp,
      });
    } else if (this.isNearLimit(z, z_min, z_max)) {
      violations.push({
        type: 'position',
        severity: 'warning',
        message: `Z position ${z.toFixed(3)}m approaching limits [${z_min}, ${z_max}]`,
        currentValue: z,
        limitValue: z < (z_min + z_max) / 2 ? z_min : z_max,
        timestamp: state.timestamp,
      });
    }

    return violations;
  }

  /**
   * Check velocity limits
   */
  private checkVelocityLimits(state: RobotState): SafetyViolation[] {
    const violations: SafetyViolation[] = [];
    const [linear, angular] = state.velocity;
    const [linear_max, angular_max] = this.limits.velocity!;

    if (Math.abs(linear) > linear_max) {
      violations.push({
        type: 'velocity',
        severity: 'critical',
        message: `Linear velocity ${Math.abs(linear).toFixed(3)}m/s exceeds limit ${linear_max}m/s`,
        currentValue: Math.abs(linear),
        limitValue: linear_max,
        timestamp: state.timestamp,
      });
    } else if (Math.abs(linear) > linear_max * this.warningThreshold) {
      violations.push({
        type: 'velocity',
        severity: 'warning',
        message: `Linear velocity ${Math.abs(linear).toFixed(3)}m/s approaching limit ${linear_max}m/s`,
        currentValue: Math.abs(linear),
        limitValue: linear_max,
        timestamp: state.timestamp,
      });
    }

    if (Math.abs(angular) > angular_max) {
      violations.push({
        type: 'velocity',
        severity: 'critical',
        message: `Angular velocity ${Math.abs(angular).toFixed(3)}rad/s exceeds limit ${angular_max}rad/s`,
        currentValue: Math.abs(angular),
        limitValue: angular_max,
        timestamp: state.timestamp,
      });
    } else if (Math.abs(angular) > angular_max * this.warningThreshold) {
      violations.push({
        type: 'velocity',
        severity: 'warning',
        message: `Angular velocity ${Math.abs(angular).toFixed(3)}rad/s approaching limit ${angular_max}rad/s`,
        currentValue: Math.abs(angular),
        limitValue: angular_max,
        timestamp: state.timestamp,
      });
    }

    return violations;
  }

  /**
   * Check acceleration limits
   */
  private checkAccelerationLimits(state: RobotState): SafetyViolation[] {
    const violations: SafetyViolation[] = [];
    const [linear, angular] = state.acceleration;
    const [linear_max, angular_max] = this.limits.acceleration!;

    if (Math.abs(linear) > linear_max) {
      violations.push({
        type: 'acceleration',
        severity: 'critical',
        message: `Linear acceleration ${Math.abs(linear).toFixed(3)}m/s² exceeds limit ${linear_max}m/s²`,
        currentValue: Math.abs(linear),
        limitValue: linear_max,
        timestamp: state.timestamp,
      });
    } else if (Math.abs(linear) > linear_max * this.warningThreshold) {
      violations.push({
        type: 'acceleration',
        severity: 'warning',
        message: `Linear acceleration ${Math.abs(linear).toFixed(3)}m/s² approaching limit ${linear_max}m/s²`,
        currentValue: Math.abs(linear),
        limitValue: linear_max,
        timestamp: state.timestamp,
      });
    }

    if (Math.abs(angular) > angular_max) {
      violations.push({
        type: 'acceleration',
        severity: 'critical',
        message: `Angular acceleration ${Math.abs(angular).toFixed(3)}rad/s² exceeds limit ${angular_max}rad/s²`,
        currentValue: Math.abs(angular),
        limitValue: angular_max,
        timestamp: state.timestamp,
      });
    } else if (Math.abs(angular) > angular_max * this.warningThreshold) {
      violations.push({
        type: 'acceleration',
        severity: 'warning',
        message: `Angular acceleration ${Math.abs(angular).toFixed(3)}rad/s² approaching limit ${angular_max}rad/s²`,
        currentValue: Math.abs(angular),
        limitValue: angular_max,
        timestamp: state.timestamp,
      });
    }

    return violations;
  }

  /**
   * Check force limit
   */
  private checkForceLimit(state: RobotState): SafetyViolation | null {
    const force = Math.abs(state.force!);
    const limit = this.limits.force!;

    if (force > limit) {
      return {
        type: 'force',
        severity: 'critical',
        message: `Force ${force.toFixed(3)}N exceeds limit ${limit}N`,
        currentValue: force,
        limitValue: limit,
        timestamp: state.timestamp,
      };
    } else if (force > limit * this.warningThreshold) {
      return {
        type: 'force',
        severity: 'warning',
        message: `Force ${force.toFixed(3)}N approaching limit ${limit}N`,
        currentValue: force,
        limitValue: limit,
        timestamp: state.timestamp,
      };
    }

    return null;
  }

  /**
   * Check torque limit
   */
  private checkTorqueLimit(state: RobotState): SafetyViolation | null {
    const torque = Math.abs(state.torque!);
    const limit = this.limits.torque!;

    if (torque > limit) {
      return {
        type: 'torque',
        severity: 'critical',
        message: `Torque ${torque.toFixed(3)}Nm exceeds limit ${limit}Nm`,
        currentValue: torque,
        limitValue: limit,
        timestamp: state.timestamp,
      };
    } else if (torque > limit * this.warningThreshold) {
      return {
        type: 'torque',
        severity: 'warning',
        message: `Torque ${torque.toFixed(3)}Nm approaching limit ${limit}Nm`,
        currentValue: torque,
        limitValue: limit,
        timestamp: state.timestamp,
      };
    }

    return null;
  }

  /**
   * Check temperature limit
   */
  private checkTemperatureLimit(state: RobotState): SafetyViolation | null {
    const temp = state.temperature!;
    const [min, max] = this.limits.temperature!;

    if (temp < min || temp > max) {
      return {
        type: 'temperature',
        severity: 'critical',
        message: `Temperature ${temp.toFixed(1)}°C outside limits [${min}, ${max}]`,
        currentValue: temp,
        limitValue: temp < min ? min : max,
        timestamp: state.timestamp,
      };
    } else if (this.isNearLimit(temp, min, max)) {
      return {
        type: 'temperature',
        severity: 'warning',
        message: `Temperature ${temp.toFixed(1)}°C approaching limits [${min}, ${max}]`,
        currentValue: temp,
        limitValue: temp < (min + max) / 2 ? min : max,
        timestamp: state.timestamp,
      };
    }

    return null;
  }

  /**
   * Check if value is near limit (within warning threshold)
   */
  private isNearLimit(value: number, min: number, max: number): boolean {
    const range = max - min;
    const threshold = range * (1 - this.warningThreshold);
    return value < min + threshold || value > max - threshold;
  }

  /**
   * Enable safety envelope checking
   */
  enable(): void {
    this.enabled = true;
    console.log('Safety envelope enabled');
  }

  /**
   * Disable safety envelope checking (use with extreme caution!)
   */
  disable(): void {
    this.enabled = false;
    console.warn('Safety envelope disabled - USE WITH EXTREME CAUTION');
  }

  /**
   * Check if safety envelope is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get violation history
   */
  getViolationHistory(): SafetyViolation[] {
    return [...this.violations];
  }

  /**
   * Clear violation history
   */
  clearViolationHistory(): void {
    this.violations = [];
    console.log('Cleared violation history');
  }

  /**
   * Get safety limits
   */
  getLimits(): PhysicalLimits {
    return { ...this.limits };
  }

  /**
   * Update safety limits
   */
  updateLimits(limits: Partial<PhysicalLimits>): void {
    Object.assign(this.limits, limits);
    console.log('Updated safety limits');
  }
}
