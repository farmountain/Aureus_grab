/**
 * Tests for ROS2 adapter
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  RealTimeSafeROS2Adapter,
  ROS2AdapterFactory,
  RealTimeConfig,
  ROS2Message,
  ROS2ConnectionConfig,
} from '../src/ros2-adapter';

describe('RealTimeSafeROS2Adapter', () => {
  let adapter: RealTimeSafeROS2Adapter;
  let config: RealTimeConfig;

  beforeEach(() => {
    config = {
      frequency: 100,
      useRealTimePriority: false, // Don't use real-time in tests
      maxJitterMs: 10,
    };
    adapter = new RealTimeSafeROS2Adapter(config);
  });

  afterEach(async () => {
    if (adapter.isConnected()) {
      await adapter.disconnect();
    }
  });

  describe('Connection Management', () => {
    it('should connect to ROS2', async () => {
      const connectionConfig: ROS2ConnectionConfig = {
        nodeName: 'test_node',
        domainId: 0,
      };

      await adapter.connect(connectionConfig);
      expect(adapter.isConnected()).toBe(true);
    });

    it('should disconnect from ROS2', async () => {
      const connectionConfig: ROS2ConnectionConfig = {
        nodeName: 'test_node',
        domainId: 0,
      };

      await adapter.connect(connectionConfig);
      await adapter.disconnect();
      expect(adapter.isConnected()).toBe(false);
    });

    it('should throw error if already connected', async () => {
      const connectionConfig: ROS2ConnectionConfig = {
        nodeName: 'test_node',
        domainId: 0,
      };

      await adapter.connect(connectionConfig);
      await expect(adapter.connect(connectionConfig)).rejects.toThrow('Already connected');
    });

    it('should handle multiple disconnects gracefully', async () => {
      const connectionConfig: ROS2ConnectionConfig = {
        nodeName: 'test_node',
        domainId: 0,
      };

      await adapter.connect(connectionConfig);
      await adapter.disconnect();
      await adapter.disconnect(); // Should not throw
      expect(adapter.isConnected()).toBe(false);
    });
  });

  describe('Message Publishing', () => {
    beforeEach(async () => {
      await adapter.connect({ nodeName: 'test_node' });
    });

    it('should publish a message', async () => {
      const message: ROS2Message = {
        topic: '/test_topic',
        messageType: 'std_msgs/String',
        data: { data: 'Hello, ROS2!' },
      };

      await expect(adapter.publish(message)).resolves.not.toThrow();
    });

    it('should add timestamp to message if not present', async () => {
      const message: ROS2Message = {
        topic: '/test_topic',
        messageType: 'std_msgs/String',
        data: { data: 'Hello, ROS2!' },
      };

      await adapter.publish(message);
      // Message should be buffered with timestamp
      // We can't directly verify this without accessing internals, but we can verify no error
    });

    it('should throw error if not connected', async () => {
      await adapter.disconnect();

      const message: ROS2Message = {
        topic: '/test_topic',
        messageType: 'std_msgs/String',
        data: { data: 'Hello, ROS2!' },
      };

      await expect(adapter.publish(message)).rejects.toThrow('Not connected');
    });
  });

  describe('Topic Subscription', () => {
    beforeEach(async () => {
      await adapter.connect({ nodeName: 'test_node' });
    });

    it('should subscribe to a topic', async () => {
      const callback = vi.fn();
      await expect(adapter.subscribe('/test_topic', callback)).resolves.not.toThrow();
    });

    it('should throw error if already subscribed', async () => {
      const callback = vi.fn();
      await adapter.subscribe('/test_topic', callback);
      await expect(adapter.subscribe('/test_topic', callback)).rejects.toThrow('Already subscribed');
    });

    it('should unsubscribe from a topic', async () => {
      const callback = vi.fn();
      await adapter.subscribe('/test_topic', callback);
      await expect(adapter.unsubscribe('/test_topic')).resolves.not.toThrow();
    });

    it('should throw error if not subscribed', async () => {
      await expect(adapter.unsubscribe('/test_topic')).rejects.toThrow('Not subscribed');
    });

    it('should throw error if not connected', async () => {
      await adapter.disconnect();
      const callback = vi.fn();
      await expect(adapter.subscribe('/test_topic', callback)).rejects.toThrow('Not connected');
    });
  });

  describe('Service Calls', () => {
    beforeEach(async () => {
      await adapter.connect({ nodeName: 'test_node' });
    });

    it('should call a service', async () => {
      const request = {
        service: '/test_service',
        serviceType: 'std_srvs/Trigger',
        request: {},
      };

      const response = await adapter.callService(request);
      expect(response.success).toBe(true);
      expect(response.response).toBeDefined();
    });

    it('should throw error if not connected', async () => {
      await adapter.disconnect();

      const request = {
        service: '/test_service',
        serviceType: 'std_srvs/Trigger',
        request: {},
      };

      await expect(adapter.callService(request)).rejects.toThrow('Not connected');
    });
  });

  describe('Control Loop Statistics', () => {
    it('should return control loop statistics', () => {
      const stats = adapter.getControlLoopStats();
      expect(stats).toHaveProperty('bufferSize');
      expect(stats).toHaveProperty('subscriptionCount');
      expect(stats).toHaveProperty('isRunning');
      expect(typeof stats.bufferSize).toBe('number');
      expect(typeof stats.subscriptionCount).toBe('number');
      expect(typeof stats.isRunning).toBe('boolean');
    });

    it('should show control loop not running when not using real-time', () => {
      const stats = adapter.getControlLoopStats();
      expect(stats.isRunning).toBe(false);
    });
  });
});

describe('ROS2AdapterFactory', () => {
  it('should create real-time-safe adapter', () => {
    const config: RealTimeConfig = {
      frequency: 100,
      useRealTimePriority: true,
      maxJitterMs: 5,
    };

    const adapter = ROS2AdapterFactory.createRealTimeSafeAdapter(config);
    expect(adapter).toBeInstanceOf(RealTimeSafeROS2Adapter);
  });

  it('should create standard adapter', () => {
    const config: RealTimeConfig = {
      frequency: 100,
      useRealTimePriority: true,
      maxJitterMs: 5,
    };

    const adapter = ROS2AdapterFactory.createStandardAdapter(config);
    expect(adapter).toBeInstanceOf(RealTimeSafeROS2Adapter);
  });
});
