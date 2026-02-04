/**
 * Emergency stop trigger system
 * 
 * Provides mechanisms to trigger emergency stops in response to
 * safety violations, watchdog timeouts, or manual interventions.
 */

import { EmergencyStopEvent, EmergencyStopReason, SafetyViolation } from './types';

/**
 * Emergency stop handler callback
 */
export type EmergencyStopHandler = (event: EmergencyStopEvent) => Promise<void>;

/**
 * Emergency stop trigger system
 */
export class EmergencyStopTrigger {
  private isEmergencyStopped: boolean = false;
  private emergencyStopEvents: EmergencyStopEvent[] = [];
  private readonly handlers: EmergencyStopHandler[] = [];
  private readonly maxEventHistory: number = 100;

  /**
   * Register an emergency stop handler
   */
  registerHandler(handler: EmergencyStopHandler): void {
    this.handlers.push(handler);
    console.log('Registered emergency stop handler');
  }

  /**
   * Remove an emergency stop handler
   */
  removeHandler(handler: EmergencyStopHandler): void {
    const index = this.handlers.indexOf(handler);
    if (index !== -1) {
      this.handlers.splice(index, 1);
      console.log('Removed emergency stop handler');
    }
  }

  /**
   * Trigger emergency stop
   */
  async trigger(reason: EmergencyStopReason, message: string, options?: {
    violation?: SafetyViolation;
    recoverable?: boolean;
  }): Promise<void> {
    const event: EmergencyStopEvent = {
      reason,
      message,
      timestamp: Date.now(),
      violation: options?.violation,
      recoverable: options?.recoverable ?? false,
    };

    console.error(`EMERGENCY STOP TRIGGERED: ${reason} - ${message}`);

    // Mark as emergency stopped
    this.isEmergencyStopped = true;

    // Add to event history
    this.emergencyStopEvents.push(event);
    if (this.emergencyStopEvents.length > this.maxEventHistory) {
      this.emergencyStopEvents.shift();
    }

    // Call all registered handlers
    const handlerPromises = this.handlers.map(async (handler) => {
      try {
        await handler(event);
      } catch (error) {
        console.error('Error in emergency stop handler:', error);
      }
    });

    await Promise.all(handlerPromises);
  }

  /**
   * Trigger emergency stop due to safety violation
   */
  async triggerForSafetyViolation(violation: SafetyViolation): Promise<void> {
    // Only trigger emergency stop for critical violations, not warnings
    if (violation.severity !== 'critical') {
      return;
    }
    
    await this.trigger(
      EmergencyStopReason.SAFETY_VIOLATION,
      `Safety violation: ${violation.message}`,
      {
        violation,
        recoverable: false, // Critical safety violations are not recoverable
      }
    );
  }

  /**
   * Trigger emergency stop due to watchdog timeout
   */
  async triggerForWatchdogTimeout(watchdogName: string): Promise<void> {
    await this.trigger(
      EmergencyStopReason.WATCHDOG_TIMEOUT,
      `Watchdog timeout: ${watchdogName}`,
      { recoverable: true }
    );
  }

  /**
   * Trigger manual emergency stop
   */
  async triggerManual(message: string): Promise<void> {
    await this.trigger(
      EmergencyStopReason.MANUAL_TRIGGER,
      message,
      { recoverable: true }
    );
  }

  /**
   * Trigger emergency stop due to communication loss
   */
  async triggerForCommunicationLoss(details: string): Promise<void> {
    await this.trigger(
      EmergencyStopReason.COMMUNICATION_LOSS,
      `Communication loss: ${details}`,
      { recoverable: true }
    );
  }

  /**
   * Trigger emergency stop due to hardware failure
   */
  async triggerForHardwareFailure(details: string): Promise<void> {
    await this.trigger(
      EmergencyStopReason.HARDWARE_FAILURE,
      `Hardware failure: ${details}`,
      { recoverable: false }
    );
  }

  /**
   * Reset emergency stop state
   */
  async reset(): Promise<void> {
    if (!this.isEmergencyStopped) {
      console.warn('Cannot reset: not in emergency stop state');
      return;
    }

    // Check if recovery is possible
    const lastEvent = this.emergencyStopEvents[this.emergencyStopEvents.length - 1];
    if (lastEvent && !lastEvent.recoverable) {
      throw new Error('Cannot reset: last emergency stop is not recoverable');
    }

    console.log('Resetting emergency stop state');
    this.isEmergencyStopped = false;
  }

  /**
   * Check if in emergency stop state
   */
  isInEmergencyStop(): boolean {
    return this.isEmergencyStopped;
  }

  /**
   * Get emergency stop event history
   */
  getEventHistory(): EmergencyStopEvent[] {
    return [...this.emergencyStopEvents];
  }

  /**
   * Get last emergency stop event
   */
  getLastEvent(): EmergencyStopEvent | undefined {
    return this.emergencyStopEvents[this.emergencyStopEvents.length - 1];
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.emergencyStopEvents = [];
    console.log('Cleared emergency stop event history');
  }

  /**
   * Get statistics
   */
  getStats(): {
    isEmergencyStopped: boolean;
    totalEvents: number;
    eventsByReason: Record<string, number>;
    lastEvent?: EmergencyStopEvent;
  } {
    const eventsByReason: Record<string, number> = {};
    
    for (const event of this.emergencyStopEvents) {
      eventsByReason[event.reason] = (eventsByReason[event.reason] || 0) + 1;
    }

    return {
      isEmergencyStopped: this.isEmergencyStopped,
      totalEvents: this.emergencyStopEvents.length,
      eventsByReason,
      lastEvent: this.getLastEvent(),
    };
  }
}

/**
 * Emergency stop coordinator
 * 
 * Coordinates emergency stops across the entire robot system
 */
export class EmergencyStopCoordinator {
  private readonly trigger: EmergencyStopTrigger;
  private readonly stopActions: Map<string, () => Promise<void>>;

  constructor(trigger: EmergencyStopTrigger) {
    this.trigger = trigger;
    this.stopActions = new Map();

    // Register default handler that executes all stop actions
    this.trigger.registerHandler(async (event) => {
      await this.executeAllStopActions();
    });
  }

  /**
   * Register a stop action
   */
  registerStopAction(name: string, action: () => Promise<void>): void {
    if (this.stopActions.has(name)) {
      throw new Error(`Stop action ${name} already registered`);
    }

    this.stopActions.set(name, action);
    console.log(`Registered stop action: ${name}`);
  }

  /**
   * Unregister a stop action
   */
  unregisterStopAction(name: string): void {
    if (!this.stopActions.has(name)) {
      throw new Error(`Stop action ${name} not found`);
    }

    this.stopActions.delete(name);
    console.log(`Unregistered stop action: ${name}`);
  }

  /**
   * Execute all stop actions
   */
  private async executeAllStopActions(): Promise<void> {
    console.log(`Executing ${this.stopActions.size} stop actions`);

    const actionPromises = Array.from(this.stopActions.entries()).map(async ([name, action]) => {
      try {
        console.log(`Executing stop action: ${name}`);
        await action();
      } catch (error) {
        console.error(`Error executing stop action ${name}:`, error);
      }
    });

    await Promise.all(actionPromises);
    console.log('All stop actions executed');
  }

  /**
   * Get the emergency stop trigger
   */
  getTrigger(): EmergencyStopTrigger {
    return this.trigger;
  }

  /**
   * Get registered stop actions
   */
  getStopActions(): string[] {
    return Array.from(this.stopActions.keys());
  }
}
