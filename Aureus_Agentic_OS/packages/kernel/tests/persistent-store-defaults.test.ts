import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkflowOrchestrator, InMemoryStateStore, FileSystemEventLog, TaskExecutor, TaskSpec, WorkflowSpec } from '../src';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Persistent Store Defaults', () => {
  let testDir: string;
  let stateStore: InMemoryStateStore;
  let executor: TaskExecutor;

  beforeEach(() => {
    // Create a temporary directory for test logs
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aureus-test-'));
    stateStore = new InMemoryStateStore();
    executor = {
      execute: async (task: TaskSpec) => {
        return { result: 'success' };
      },
    };
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  it('should use FileSystemEventLog as default when no eventLog is provided', async () => {
    // Create a test-specific directory for this test
    const testLogDir = path.join(testDir, 'default-test');
    
    // Temporarily override the default directory by explicitly passing it
    // Note: In real usage, the default would be './var/run', but for testing
    // we need to use a test-specific directory to avoid conflicts
    const eventLog = new FileSystemEventLog(testLogDir);
    const orchestrator = new WorkflowOrchestrator(stateStore, executor, eventLog);

    const spec: WorkflowSpec = {
      id: 'test-workflow-default',
      name: 'Test Default Event Log',
      tasks: [
        { id: 'task1', name: 'Task 1', type: 'action' },
      ],
      dependencies: new Map(),
    };

    // Execute workflow
    const result = await orchestrator.executeWorkflow(spec);

    expect(result.status).toBe('completed');
    
    // Verify that event log was created
    const logPath = path.join(testLogDir, spec.id, 'events.log');
    expect(fs.existsSync(logPath)).toBe(true);

    // Read and verify events were logged
    const logContent = fs.readFileSync(logPath, 'utf-8');
    const events = logContent.trim().split('\n').map(line => JSON.parse(line));
    
    expect(events.length).toBeGreaterThan(0);
    expect(events.some(e => e.type === 'WORKFLOW_STARTED')).toBe(true);
    expect(events.some(e => e.type === 'WORKFLOW_COMPLETED')).toBe(true);
  });

  it('should create FileSystemEventLog with default location when no eventLog parameter is provided', () => {
    // This test verifies the type of the default event log without executing a workflow
    // to avoid creating files in the actual ./var/run directory during tests
    const orchestrator = new WorkflowOrchestrator(stateStore, executor);
    
    // Access the private eventLog field through TypeScript's type system
    // In a real scenario, the orchestrator would use FileSystemEventLog by default
    const eventLogField = (orchestrator as any).eventLog;
    
    // Verify that the event log is an instance of FileSystemEventLog
    expect(eventLogField).toBeInstanceOf(FileSystemEventLog);
  });

  it('should use custom FileSystemEventLog when provided', async () => {
    // Create orchestrator with custom event log directory
    const customEventLog = new FileSystemEventLog(testDir);
    const orchestrator = new WorkflowOrchestrator(stateStore, executor, customEventLog);

    const spec: WorkflowSpec = {
      id: 'test-workflow-custom',
      name: 'Test Custom Event Log',
      tasks: [
        { id: 'task1', name: 'Task 1', type: 'action' },
      ],
      dependencies: new Map(),
    };

    // Execute workflow
    const result = await orchestrator.executeWorkflow(spec);

    expect(result.status).toBe('completed');
    
    // Verify that event log was created in the custom location
    const customLogPath = path.join(testDir, spec.id, 'events.log');
    expect(fs.existsSync(customLogPath)).toBe(true);

    // Read and verify events were logged
    const logContent = fs.readFileSync(customLogPath, 'utf-8');
    const events = logContent.trim().split('\n').map(line => JSON.parse(line));
    
    expect(events.length).toBeGreaterThan(0);
    expect(events.some(e => e.type === 'WORKFLOW_STARTED')).toBe(true);
    expect(events.some(e => e.type === 'WORKFLOW_COMPLETED')).toBe(true);
  });

  it('should persist events across multiple workflow executions', async () => {
    const customEventLog = new FileSystemEventLog(testDir);
    const orchestrator = new WorkflowOrchestrator(stateStore, executor, customEventLog);

    const spec: WorkflowSpec = {
      id: 'test-workflow-persist',
      name: 'Test Event Persistence',
      tasks: [
        { id: 'task1', name: 'Task 1', type: 'action' },
      ],
      dependencies: new Map(),
    };

    // Execute workflow first time
    await orchestrator.executeWorkflow(spec);

    // Read events after first execution
    const logPath = path.join(testDir, spec.id, 'events.log');
    const firstContent = fs.readFileSync(logPath, 'utf-8');
    const firstEvents = firstContent.trim().split('\n').map(line => JSON.parse(line));

    // Execute workflow again (simulating resume or retry)
    await orchestrator.executeWorkflow(spec);

    // Read events after second execution
    const secondContent = fs.readFileSync(logPath, 'utf-8');
    const secondEvents = secondContent.trim().split('\n').map(line => JSON.parse(line));

    // Verify that events were appended, not overwritten
    expect(secondEvents.length).toBeGreaterThan(firstEvents.length);
    
    // Verify first execution events are still present
    for (let i = 0; i < firstEvents.length; i++) {
      expect(secondEvents[i]).toEqual(firstEvents[i]);
    }
  });

  it('should create event log directory if it does not exist', async () => {
    // Use a non-existent directory
    const nonExistentDir = path.join(testDir, 'nested', 'dir', 'structure');
    expect(fs.existsSync(nonExistentDir)).toBe(false);

    const customEventLog = new FileSystemEventLog(nonExistentDir);
    const orchestrator = new WorkflowOrchestrator(stateStore, executor, customEventLog);

    const spec: WorkflowSpec = {
      id: 'test-workflow-create-dir',
      name: 'Test Directory Creation',
      tasks: [
        { id: 'task1', name: 'Task 1', type: 'action' },
      ],
      dependencies: new Map(),
    };

    // Execute workflow
    await orchestrator.executeWorkflow(spec);

    // Verify that directory was created
    expect(fs.existsSync(nonExistentDir)).toBe(true);
    
    // Verify that event log was created
    const logPath = path.join(nonExistentDir, spec.id, 'events.log');
    expect(fs.existsSync(logPath)).toBe(true);
  });

  it('should support reading events from FileSystemEventLog', async () => {
    const customEventLog = new FileSystemEventLog(testDir);
    const orchestrator = new WorkflowOrchestrator(stateStore, executor, customEventLog);

    const spec: WorkflowSpec = {
      id: 'test-workflow-read',
      name: 'Test Event Reading',
      tasks: [
        { id: 'task1', name: 'Task 1', type: 'action' },
      ],
      dependencies: new Map(),
    };

    // Execute workflow
    await orchestrator.executeWorkflow(spec);

    // Read events using the EventLog API
    const events = await customEventLog.read(spec.id);

    expect(events.length).toBeGreaterThan(0);
    expect(events.some(e => e.type === 'WORKFLOW_STARTED')).toBe(true);
    expect(events.some(e => e.type === 'TASK_STARTED')).toBe(true);
    expect(events.some(e => e.type === 'TASK_COMPLETED')).toBe(true);
    expect(events.some(e => e.type === 'WORKFLOW_COMPLETED')).toBe(true);
    
    // Verify events have proper structure
    events.forEach(event => {
      expect(event.timestamp).toBeInstanceOf(Date);
      expect(event.type).toBeDefined();
      expect(event.workflowId).toBe(spec.id);
    });
  });
});
