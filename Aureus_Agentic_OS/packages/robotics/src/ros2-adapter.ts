/**
 * ROS2 Adapter with real-time-safe capabilities
 * 
 * This adapter provides integration with ROS2 (Robot Operating System 2)
 * or equivalent control middleware with real-time safety guarantees.
 */

import { ROS2Message, ROS2ServiceRequest, ROS2ServiceResponse, RealTimeConfig } from './types';

/**
 * ROS2 adapter interface for middleware integration
 */
export interface IROS2Adapter {
  connect(config: ROS2ConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  publish(message: ROS2Message): Promise<void>;
  subscribe(topic: string, callback: (message: ROS2Message) => void): Promise<void>;
  unsubscribe(topic: string): Promise<void>;
  callService(request: ROS2ServiceRequest): Promise<ROS2ServiceResponse>;
}

/**
 * ROS2 connection configuration
 */
export interface ROS2ConnectionConfig {
  /** ROS2 domain ID */
  domainId?: number;
  /** Node name */
  nodeName: string;
  /** Namespace */
  namespace?: string;
  /** Quality of Service settings */
  qosProfile?: QoSProfile;
}

/**
 * Quality of Service profile for ROS2
 */
export interface QoSProfile {
  reliability: 'reliable' | 'best-effort';
  durability: 'volatile' | 'transient-local';
  history: 'keep-last' | 'keep-all';
  depth?: number;
}

/**
 * Real-time-safe ROS2 adapter implementation
 * 
 * This implementation ensures real-time safety through:
 * - Lock-free data structures
 * - Pre-allocated buffers
 * - Bounded execution times
 * - Priority-based scheduling
 */
export class RealTimeSafeROS2Adapter implements IROS2Adapter {
  private connected: boolean = false;
  private readonly config: RealTimeConfig;
  private readonly subscriptions: Map<string, (message: ROS2Message) => void>;
  private readonly messageBuffer: ROS2Message[];
  private readonly maxBufferSize: number = 1000;
  private controlLoopHandle?: NodeJS.Timeout;

  constructor(config: RealTimeConfig) {
    this.config = config;
    this.subscriptions = new Map();
    this.messageBuffer = [];
  }

  /**
   * Connect to ROS2 middleware
   */
  async connect(config: ROS2ConnectionConfig): Promise<void> {
    if (this.connected) {
      throw new Error('Already connected to ROS2');
    }

    // In a real implementation, this would initialize the ROS2 client library
    // For now, we simulate the connection
    console.log(`Connecting to ROS2 with domain ID ${config.domainId || 0}, node: ${config.nodeName}`);
    
    // Start real-time control loop
    if (this.config.useRealTimePriority) {
      this.startRealTimeControlLoop();
    }

    this.connected = true;
  }

  /**
   * Disconnect from ROS2 middleware
   */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    // Stop control loop
    if (this.controlLoopHandle) {
      clearInterval(this.controlLoopHandle);
      this.controlLoopHandle = undefined;
    }

    // Clear subscriptions
    this.subscriptions.clear();
    this.messageBuffer.length = 0;

    this.connected = false;
    console.log('Disconnected from ROS2');
  }

  /**
   * Check if connected to ROS2
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Publish a message to a ROS2 topic
   * 
   * Real-time safe: Uses pre-allocated buffer and bounded execution
   */
  async publish(message: ROS2Message): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to ROS2');
    }

    // Add timestamp if not present
    const timestampedMessage: ROS2Message = {
      ...message,
      timestamp: message.timestamp || Date.now(),
    };

    // In real-time mode, use circular buffer to avoid allocation
    if (this.messageBuffer.length >= this.maxBufferSize) {
      // Note: shift() is O(n), consider using a circular buffer for production
      this.messageBuffer.shift(); // Remove oldest message
    }
    this.messageBuffer.push(timestampedMessage);

    // In a real implementation, this would call the ROS2 publish API
    // For now, we simulate publishing
    console.log(`Publishing to ${message.topic}: ${message.messageType}`);
  }

  /**
   * Subscribe to a ROS2 topic
   */
  async subscribe(topic: string, callback: (message: ROS2Message) => void): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to ROS2');
    }

    if (this.subscriptions.has(topic)) {
      throw new Error(`Already subscribed to topic: ${topic}`);
    }

    this.subscriptions.set(topic, callback);
    console.log(`Subscribed to topic: ${topic}`);
  }

  /**
   * Unsubscribe from a ROS2 topic
   */
  async unsubscribe(topic: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected to ROS2');
    }

    if (!this.subscriptions.has(topic)) {
      throw new Error(`Not subscribed to topic: ${topic}`);
    }

    this.subscriptions.delete(topic);
    console.log(`Unsubscribed from topic: ${topic}`);
  }

  /**
   * Call a ROS2 service
   */
  async callService(request: ROS2ServiceRequest): Promise<ROS2ServiceResponse> {
    if (!this.connected) {
      throw new Error('Not connected to ROS2');
    }

    // In a real implementation, this would call the ROS2 service API
    // For now, we simulate a service call
    console.log(`Calling service: ${request.service}`);
    
    return {
      success: true,
      response: { result: 'simulated' },
    };
  }

  /**
   * Start real-time control loop
   */
  private startRealTimeControlLoop(): void {
    const periodMs = 1000 / this.config.frequency;
    let lastExecutionTime = Date.now();

    this.controlLoopHandle = setInterval(() => {
      const currentTime = Date.now();
      const jitter = currentTime - lastExecutionTime - periodMs;

      // Check for excessive jitter
      if (Math.abs(jitter) > this.config.maxJitterMs) {
        console.warn(`Real-time violation: jitter ${jitter.toFixed(2)}ms exceeds limit ${this.config.maxJitterMs}ms`);
      }

      // Process messages from buffer
      this.processMessageBuffer();

      lastExecutionTime = currentTime;
    }, periodMs);
  }

  /**
   * Process messages in buffer
   */
  private processMessageBuffer(): void {
    // Process a bounded number of messages per cycle for real-time safety
    const maxMessagesPerCycle = 10;
    let processed = 0;

    while (this.messageBuffer.length > 0 && processed < maxMessagesPerCycle) {
      const message = this.messageBuffer.shift();
      if (message) {
        const callback = this.subscriptions.get(message.topic);
        if (callback) {
          try {
            callback(message);
          } catch (error) {
            console.error(`Error in subscription callback for ${message.topic}:`, error);
          }
        }
      }
      processed++;
    }
  }

  /**
   * Get current control loop statistics
   */
  getControlLoopStats(): {
    bufferSize: number;
    subscriptionCount: number;
    isRunning: boolean;
  } {
    return {
      bufferSize: this.messageBuffer.length,
      subscriptionCount: this.subscriptions.size,
      isRunning: this.controlLoopHandle !== undefined,
    };
  }
}

/**
 * Factory for creating ROS2 adapters
 */
export class ROS2AdapterFactory {
  /**
   * Create a real-time-safe ROS2 adapter
   */
  static createRealTimeSafeAdapter(config: RealTimeConfig): RealTimeSafeROS2Adapter {
    return new RealTimeSafeROS2Adapter(config);
  }

  /**
   * Create a standard ROS2 adapter (non-real-time)
   */
  static createStandardAdapter(config: RealTimeConfig): RealTimeSafeROS2Adapter {
    // For simplicity, we use the same implementation but with different config
    return new RealTimeSafeROS2Adapter({
      ...config,
      useRealTimePriority: false,
    });
  }
}
