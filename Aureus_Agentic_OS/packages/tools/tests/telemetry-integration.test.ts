import { describe, it, expect, beforeEach } from 'vitest';
import { TelemetryCollector, TelemetryEventType } from '@aureus/observability';
import { SafeToolWrapper, ToolSpec } from '../src';

describe('Tool Telemetry Integration', () => {
  let telemetry: TelemetryCollector;
  let tool: ToolSpec;
  let wrapper: SafeToolWrapper;

  beforeEach(() => {
    telemetry = new TelemetryCollector();
    
    tool = {
      id: 'test-tool',
      name: 'Test Tool',
      description: 'A test tool',
      parameters: [
        { name: 'url', type: 'string', required: true },
        { name: 'apiKey', type: 'string', required: false },
      ],
      execute: async (params) => {
        return { status: 'success', data: params };
      },
    };
    
    wrapper = new SafeToolWrapper(tool);
  });

  it('should record tool call with sanitized parameters', async () => {
    const params = {
      url: 'https://api.example.com',
      apiKey: 'secret-key-123',
      data: { value: 42 },
    };

    await wrapper.execute(params, {
      workflowId: 'wf-1',
      taskId: 'task-1',
      stepId: 'step-1',
      telemetry,
    });

    const events = telemetry.getEventsByType(TelemetryEventType.TOOL_CALL);
    expect(events).toHaveLength(1);
    expect(events[0].data.toolName).toBe('Test Tool');
    expect(events[0].data.args).toEqual({
      url: 'https://api.example.com',
      apiKey: '[REDACTED]', // Sensitive field should be redacted
      data: { value: 42 },
    });
  });

  it('should redact multiple sensitive fields', async () => {
    const params = {
      username: 'user123',
      password: 'secret-password',
      token: 'bearer-token',
      access_token: 'oauth-token',
      apiKey: 'api-key',
    };

    await wrapper.execute(params, {
      workflowId: 'wf-2',
      taskId: 'task-2',
      stepId: 'step-2',
      telemetry,
    });

    const events = telemetry.getEventsByType(TelemetryEventType.TOOL_CALL);
    expect(events).toHaveLength(1);
    
    const args = events[0].data.args as Record<string, unknown>;
    expect(args.username).toBe('user123'); // Not sensitive
    expect(args.password).toBe('[REDACTED]');
    expect(args.token).toBe('[REDACTED]');
    expect(args.access_token).toBe('[REDACTED]');
    expect(args.apiKey).toBe('[REDACTED]');
  });

  it('should handle nested objects with sensitive fields', async () => {
    const params = {
      config: {
        endpoint: 'https://api.example.com',
        credentials: {
          username: 'user',
          password: 'secret',
        },
      },
    };

    await wrapper.execute(params, {
      workflowId: 'wf-3',
      taskId: 'task-3',
      stepId: 'step-3',
      telemetry,
    });

    const events = telemetry.getEventsByType(TelemetryEventType.TOOL_CALL);
    expect(events).toHaveLength(1);
    
    const args = events[0].data.args as Record<string, unknown>;
    expect(args.config).toBeDefined();
    
    const config = args.config as Record<string, unknown>;
    expect(config.endpoint).toBe('https://api.example.com');
    expect(config.credentials).toBe('[REDACTED]'); // Nested sensitive object
  });

  it('should not record telemetry when telemetry collector not provided', async () => {
    const params = { url: 'https://api.example.com' };

    await wrapper.execute(params, {
      workflowId: 'wf-4',
      taskId: 'task-4',
      stepId: 'step-4',
      // No telemetry provided
    });

    const events = telemetry.getEventsByType(TelemetryEventType.TOOL_CALL);
    expect(events).toHaveLength(0);
  });
});
