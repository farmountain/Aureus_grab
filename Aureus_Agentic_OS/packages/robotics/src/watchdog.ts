/**
 * Watchdog system for monitoring robot operations
 * 
 * Provides multiple watchdogs that monitor different aspects of robot operation
 * and trigger emergency stops when timeouts or failures are detected.
 */

import { WatchdogConfig, WatchdogStatus, EmergencyStopEvent, EmergencyStopReason } from './types';

/**
 * Watchdog for monitoring robot operations
 */
export class Watchdog {
  private readonly config: WatchdogConfig;
  private isActive: boolean = false;
  private lastHeartbeat: number = 0;
  private timeoutCount: number = 0;
  private restartCount: number = 0;
  private timeoutHandle?: NodeJS.Timeout;

  constructor(config: WatchdogConfig) {
    this.config = {
      ...config,
      autoRestart: config.autoRestart ?? true,
      maxRestarts: config.maxRestarts ?? 3,
    };
  }

  /**
   * Start the watchdog
   */
  start(): void {
    if (this.isActive) {
      console.warn(`Watchdog ${this.config.name} is already active`);
      return;
    }

    this.isActive = true;
    this.lastHeartbeat = Date.now();
    this.scheduleTimeoutCheck();
    console.log(`Watchdog ${this.config.name} started with timeout ${this.config.timeoutMs}ms`);
  }

  /**
   * Stop the watchdog
   */
  stop(): void {
    if (!this.isActive) {
      return;
    }

    this.isActive = false;
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
      this.timeoutHandle = undefined;
    }
    console.log(`Watchdog ${this.config.name} stopped`);
  }

  /**
   * Send a heartbeat to reset the timeout
   */
  heartbeat(): void {
    if (!this.isActive) {
      return;
    }

    this.lastHeartbeat = Date.now();
    // Reschedule timeout check
    if (this.timeoutHandle) {
      clearTimeout(this.timeoutHandle);
    }
    this.scheduleTimeoutCheck();
  }

  /**
   * Get watchdog status
   */
  getStatus(): WatchdogStatus {
    return {
      name: this.config.name,
      isActive: this.isActive,
      lastHeartbeat: this.lastHeartbeat,
      timeoutCount: this.timeoutCount,
      restartCount: this.restartCount,
    };
  }

  /**
   * Reset watchdog counters
   */
  reset(): void {
    this.timeoutCount = 0;
    this.restartCount = 0;
    this.lastHeartbeat = Date.now();
  }

  /**
   * Schedule timeout check
   */
  private scheduleTimeoutCheck(): void {
    this.timeoutHandle = setTimeout(async () => {
      if (!this.isActive) {
        return;
      }

      const now = Date.now();
      const elapsed = now - this.lastHeartbeat;

      if (elapsed >= this.config.timeoutMs) {
        console.error(`Watchdog ${this.config.name} timeout! Elapsed: ${elapsed}ms`);
        this.timeoutCount++;

        // Call timeout handler
        try {
          await this.config.onTimeout();
        } catch (error) {
          console.error(`Error in watchdog ${this.config.name} timeout handler:`, error);
        }

        // Auto-restart if enabled
        if (this.config.autoRestart && this.restartCount < (this.config.maxRestarts || 3)) {
          this.restartCount++;
          console.log(`Restarting watchdog ${this.config.name} (restart ${this.restartCount}/${this.config.maxRestarts})`);
          this.lastHeartbeat = Date.now();
          this.scheduleTimeoutCheck();
        } else {
          this.stop();
        }
      }
    }, this.config.timeoutMs);
  }
}

/**
 * Watchdog manager for coordinating multiple watchdogs
 */
export class WatchdogManager {
  private readonly watchdogs: Map<string, Watchdog>;

  constructor() {
    this.watchdogs = new Map();
  }

  /**
   * Add a watchdog
   */
  addWatchdog(config: WatchdogConfig): void {
    if (this.watchdogs.has(config.name)) {
      throw new Error(`Watchdog ${config.name} already exists`);
    }

    const watchdog = new Watchdog(config);
    this.watchdogs.set(config.name, watchdog);
    console.log(`Added watchdog: ${config.name}`);
  }

  /**
   * Remove a watchdog
   */
  removeWatchdog(name: string): void {
    const watchdog = this.watchdogs.get(name);
    if (!watchdog) {
      throw new Error(`Watchdog ${name} not found`);
    }

    watchdog.stop();
    this.watchdogs.delete(name);
    console.log(`Removed watchdog: ${name}`);
  }

  /**
   * Start a watchdog
   */
  startWatchdog(name: string): void {
    const watchdog = this.watchdogs.get(name);
    if (!watchdog) {
      throw new Error(`Watchdog ${name} not found`);
    }

    watchdog.start();
  }

  /**
   * Stop a watchdog
   */
  stopWatchdog(name: string): void {
    const watchdog = this.watchdogs.get(name);
    if (!watchdog) {
      throw new Error(`Watchdog ${name} not found`);
    }

    watchdog.stop();
  }

  /**
   * Start all watchdogs
   */
  startAll(): void {
    for (const watchdog of this.watchdogs.values()) {
      watchdog.start();
    }
    console.log(`Started ${this.watchdogs.size} watchdogs`);
  }

  /**
   * Stop all watchdogs
   */
  stopAll(): void {
    for (const watchdog of this.watchdogs.values()) {
      watchdog.stop();
    }
    console.log(`Stopped ${this.watchdogs.size} watchdogs`);
  }

  /**
   * Send heartbeat to a specific watchdog
   */
  heartbeat(name: string): void {
    const watchdog = this.watchdogs.get(name);
    if (!watchdog) {
      throw new Error(`Watchdog ${name} not found`);
    }

    watchdog.heartbeat();
  }

  /**
   * Send heartbeat to all watchdogs
   */
  heartbeatAll(): void {
    for (const watchdog of this.watchdogs.values()) {
      watchdog.heartbeat();
    }
  }

  /**
   * Get status of a specific watchdog
   */
  getWatchdogStatus(name: string): WatchdogStatus {
    const watchdog = this.watchdogs.get(name);
    if (!watchdog) {
      throw new Error(`Watchdog ${name} not found`);
    }

    return watchdog.getStatus();
  }

  /**
   * Get status of all watchdogs
   */
  getAllStatus(): WatchdogStatus[] {
    return Array.from(this.watchdogs.values()).map(w => w.getStatus());
  }

  /**
   * Reset a specific watchdog
   */
  resetWatchdog(name: string): void {
    const watchdog = this.watchdogs.get(name);
    if (!watchdog) {
      throw new Error(`Watchdog ${name} not found`);
    }

    watchdog.reset();
  }

  /**
   * Reset all watchdogs
   */
  resetAll(): void {
    for (const watchdog of this.watchdogs.values()) {
      watchdog.reset();
    }
    console.log('Reset all watchdogs');
  }

  /**
   * Get count of active watchdogs
   */
  getActiveCount(): number {
    return Array.from(this.watchdogs.values()).filter(w => w.getStatus().isActive).length;
  }
}
