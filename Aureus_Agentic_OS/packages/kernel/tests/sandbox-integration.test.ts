import { describe, it, expect, beforeEach } from 'vitest';
import { 
  SandboxIntegration,
  TaskSpec,
  TaskState,
  InMemoryStateStore,
} from '../src';
import { TelemetryCollector } from '@aureus/observability';
import { HipCortex, MemoryAPI } from '@aureus/memory-hipcortex';
import { CRVGate, Validators } from '@aureus/crv';

describe('SandboxIntegration', () => {
  let sandboxIntegration: SandboxIntegration;
  let telemetry: TelemetryCollector;
  let memoryAPI: MemoryAPI;
  let crvGate: CRVGate;

  beforeEach(() => {
    telemetry = new TelemetryCollector();
    const hipCortex = new HipCortex();
    memoryAPI = new MemoryAPI(hipCortex);
    
    crvGate = new CRVGate({
      name: 'Test Gate',
      validators: [Validators.notNull()],
      blockOnFailure: true,
    }, telemetry);

    sandboxIntegration = new SandboxIntegration(telemetry);
  });

  describe('Task execution without sandbox', () => {
    it('should execute task normally when sandbox is not enabled', async () => {
      const task: TaskSpec = {
        id: 'task-1',
        name: 'Test Task',
        type: 'action',
        inputs: { value: 42 },
      };

      const taskState: TaskState = {
        taskId: 'task-1',
        status: 'pending',
        attempt: 0,
      };

      const mockExecutor = async (t: TaskSpec, s: TaskState) => {
        return { result: 'success', value: t.inputs?.value };
      };

      const result = await sandboxIntegration.executeInSandbox(
        task,
        taskState,
        mockExecutor,
        {
          workflowId: 'workflow-1',
          taskId: 'task-1',
        }
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ result: 'success', value: 42 });
      expect(result.metadata.simulationMode).toBe(false);
    });
  });

  describe('Task execution in simulation sandbox', () => {
    it('should execute task in simulation mode and capture side effects', async () => {
      const task: TaskSpec = {
        id: 'task-2',
        name: 'Simulation Task',
        type: 'action',
        inputs: { value: 100 },
        sandboxConfig: {
          enabled: true,
          simulationMode: true,
        },
      };

      const taskState: TaskState = {
        taskId: 'task-2',
        status: 'pending',
        attempt: 0,
      };

      const mockExecutor = async (t: TaskSpec, s: TaskState) => {
        return { result: 'simulated', value: t.inputs?.value };
      };

      const result = await sandboxIntegration.executeInSandbox(
        task,
        taskState,
        mockExecutor,
        {
          workflowId: 'workflow-1',
          taskId: 'task-2',
        }
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ result: 'simulated', value: 100 });
      expect(result.metadata.simulationMode).toBe(true);
      expect(result.metadata.sandboxId).toContain('simulation-');
    });

    it('should log execution results to HipCortex', async () => {
      const task: TaskSpec = {
        id: 'task-3',
        name: 'HipCortex Task',
        type: 'action',
        inputs: { value: 200 },
        sandboxConfig: {
          enabled: true,
          simulationMode: true,
        },
      };

      const taskState: TaskState = {
        taskId: 'task-3',
        status: 'pending',
        attempt: 0,
      };

      const mockExecutor = async (t: TaskSpec, s: TaskState) => {
        return { result: 'logged', value: t.inputs?.value };
      };

      const result = await sandboxIntegration.executeInSandbox(
        task,
        taskState,
        mockExecutor,
        {
          workflowId: 'workflow-1',
          taskId: 'task-3',
          memoryAPI,
        }
      );

      expect(result.success).toBe(true);
      expect(result.metadata.hipCortexEntryId).toBeDefined();

      // Verify entry was created in HipCortex
      const entries = memoryAPI.read({ tags: ['sandbox_execution'] });
      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0].content).toMatchObject({
        event: 'sandbox_tool_execution',
        taskId: 'task-3',
      });
    });
  });

  describe('CRV validation of sandbox outputs', () => {
    it('should run CRV validation on successful outputs', async () => {
      const task: TaskSpec = {
        id: 'task-4',
        name: 'CRV Task',
        type: 'action',
        inputs: { value: 300 },
        sandboxConfig: {
          enabled: true,
          simulationMode: true,
        },
      };

      const taskState: TaskState = {
        taskId: 'task-4',
        status: 'pending',
        attempt: 0,
      };

      const mockExecutor = async (t: TaskSpec, s: TaskState) => {
        return { result: 'validated', value: t.inputs?.value };
      };

      const result = await sandboxIntegration.executeInSandbox(
        task,
        taskState,
        mockExecutor,
        {
          workflowId: 'workflow-1',
          taskId: 'task-4',
          crvGate,
        }
      );

      expect(result.success).toBe(true);
      expect(result.metadata.crvValidation).toBeDefined();
      expect(result.metadata.crvValidation?.passed).toBe(true);
      expect(result.metadata.crvValidation?.blockedCommit).toBe(false);
    });

    it('should block execution if CRV validation fails', async () => {
      // Create a CRV gate that always fails
      const strictGate = new CRVGate({
        name: 'Strict Gate',
        validators: [
          async (commit) => ({
            valid: false,
            reason: 'Validation failed intentionally',
            failure_code: 'TEST_FAILURE',
          }),
        ],
        blockOnFailure: true,
      }, telemetry);

      const task: TaskSpec = {
        id: 'task-5',
        name: 'Failed CRV Task',
        type: 'action',
        inputs: { value: 400 },
        sandboxConfig: {
          enabled: true,
          simulationMode: true,
        },
      };

      const taskState: TaskState = {
        taskId: 'task-5',
        status: 'pending',
        attempt: 0,
      };

      const mockExecutor = async (t: TaskSpec, s: TaskState) => {
        return { result: 'should_fail', value: t.inputs?.value };
      };

      const result = await sandboxIntegration.executeInSandbox(
        task,
        taskState,
        mockExecutor,
        {
          workflowId: 'workflow-1',
          taskId: 'task-5',
          crvGate: strictGate,
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('CRV validation failed');
      expect(result.metadata.crvValidation?.blockedCommit).toBe(true);
    });
  });

  describe('Sandbox configuration by risk tier', () => {
    it('should use restrictive config for HIGH risk tasks', async () => {
      const task: TaskSpec = {
        id: 'task-6',
        name: 'High Risk Task',
        type: 'action',
        riskTier: 'HIGH',
        inputs: { value: 500 },
        sandboxConfig: {
          enabled: true,
          type: 'mock',
        },
      };

      const taskState: TaskState = {
        taskId: 'task-6',
        status: 'pending',
        attempt: 0,
      };

      const mockExecutor = async (t: TaskSpec, s: TaskState) => {
        return { result: 'restricted', value: t.inputs?.value };
      };

      const result = await sandboxIntegration.executeInSandbox(
        task,
        taskState,
        mockExecutor,
        {
          workflowId: 'workflow-1',
          taskId: 'task-6',
        }
      );

      expect(result.success).toBe(true);
      expect(result.metadata.sandboxId).toBeDefined();
    });

    it('should use standard config for MEDIUM risk tasks', async () => {
      const task: TaskSpec = {
        id: 'task-7',
        name: 'Medium Risk Task',
        type: 'action',
        riskTier: 'MEDIUM',
        inputs: { value: 600 },
        sandboxConfig: {
          enabled: true,
          type: 'mock',
        },
      };

      const taskState: TaskState = {
        taskId: 'task-7',
        status: 'pending',
        attempt: 0,
      };

      const mockExecutor = async (t: TaskSpec, s: TaskState) => {
        return { result: 'standard', value: t.inputs?.value };
      };

      const result = await sandboxIntegration.executeInSandbox(
        task,
        taskState,
        mockExecutor,
        {
          workflowId: 'workflow-1',
          taskId: 'task-7',
        }
      );

      expect(result.success).toBe(true);
      expect(result.metadata.sandboxId).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('should handle executor errors gracefully', async () => {
      const task: TaskSpec = {
        id: 'task-8',
        name: 'Error Task',
        type: 'action',
        inputs: { value: 700 },
        sandboxConfig: {
          enabled: true,
          simulationMode: true,
        },
      };

      const taskState: TaskState = {
        taskId: 'task-8',
        status: 'pending',
        attempt: 0,
      };

      const mockExecutor = async (t: TaskSpec, s: TaskState) => {
        throw new Error('Execution failed');
      };

      const result = await sandboxIntegration.executeInSandbox(
        task,
        taskState,
        mockExecutor,
        {
          workflowId: 'workflow-1',
          taskId: 'task-8',
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Execution failed');
      expect(result.metadata.simulationMode).toBe(true);
    });
  });
});
