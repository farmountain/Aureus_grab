import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadTaskSpec, LoadTaskSpecOptions } from '../src/task-loader';
import { WorkflowValidationError } from '../src/workflow-checker';
import { STRICT_SAFETY_POLICY, PERMISSIVE_SAFETY_POLICY } from '../src/safety-policy';

const TEST_DIR = path.join(os.tmpdir(), 'workflow-checker-integration-tests');

describe('Task Loader Integration - Model Checking', () => {
  beforeEach(async () => {
    // Create test directory
    await fs.promises.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test files
    await fs.promises.rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should load and validate a valid workflow', async () => {
    const workflowYaml = `
id: valid-workflow
name: Valid Workflow
tasks:
  - id: task-1
    name: Read Data
    type: action
    riskTier: LOW
  - id: task-2
    name: Process Data
    type: action
    riskTier: MEDIUM
dependencies:
  task-2:
    - task-1
`;

    const filePath = path.join(TEST_DIR, 'valid-workflow.yaml');
    await fs.promises.writeFile(filePath, workflowYaml);

    const workflow = await loadTaskSpec(filePath);
    
    expect(workflow.id).toBe('valid-workflow');
    expect(workflow.tasks).toHaveLength(2);
  });

  it('should reject workflow with CRITICAL task followed by unapproved action', async () => {
    const workflowYaml = `
id: invalid-workflow
name: Invalid Workflow
tasks:
  - id: critical-task
    name: Drop Database
    type: action
    riskTier: CRITICAL
    requiredPermissions:
      - action: admin
        resource: database
    compensation:
      onFailure: rollback
  - id: next-task
    name: Send Notification
    type: action
    riskTier: LOW
dependencies:
  next-task:
    - critical-task
`;

    const filePath = path.join(TEST_DIR, 'invalid-workflow.yaml');
    await fs.promises.writeFile(filePath, workflowYaml);

    await expect(loadTaskSpec(filePath)).rejects.toThrow(WorkflowValidationError);
    
    try {
      await loadTaskSpec(filePath);
    } catch (error) {
      if (error instanceof WorkflowValidationError) {
        expect(error.result.violations).toHaveLength(1);
        expect(error.result.violations[0].message).toContain('critical-task');
        expect(error.result.violations[0].message).toContain('next-task');
      }
    }
  });

  it('should accept workflow with CRITICAL task followed by compensation', async () => {
    const workflowYaml = `
id: valid-critical-workflow
name: Valid CRITICAL Workflow
tasks:
  - id: critical-task
    name: Drop Database
    type: action
    riskTier: CRITICAL
    requiredPermissions:
      - action: admin
        resource: database
    compensation:
      onFailure: rollback-task
  - id: rollback-task
    name: Rollback
    type: action
    riskTier: LOW
dependencies:
  rollback-task:
    - critical-task
`;

    const filePath = path.join(TEST_DIR, 'valid-critical-workflow.yaml');
    await fs.promises.writeFile(filePath, workflowYaml);

    const workflow = await loadTaskSpec(filePath);
    
    expect(workflow.id).toBe('valid-critical-workflow');
    expect(workflow.tasks).toHaveLength(2);
  });

  it('should reject workflow with HIGH risk task without permissions', async () => {
    const workflowYaml = `
id: high-risk-no-perms
name: High Risk Without Permissions
tasks:
  - id: high-risk-task
    name: Modify Data
    type: action
    riskTier: HIGH
dependencies: {}
`;

    const filePath = path.join(TEST_DIR, 'high-risk-no-perms.yaml');
    await fs.promises.writeFile(filePath, workflowYaml);

    await expect(loadTaskSpec(filePath)).rejects.toThrow(WorkflowValidationError);
  });

  it('should skip validation when validate option is false', async () => {
    const workflowYaml = `
id: invalid-workflow-skip-validation
name: Invalid Workflow
tasks:
  - id: critical-task
    name: Drop Database
    type: action
    riskTier: CRITICAL
  - id: next-task
    name: Send Notification
    type: action
    riskTier: LOW
dependencies:
  next-task:
    - critical-task
`;

    const filePath = path.join(TEST_DIR, 'invalid-skip.yaml');
    await fs.promises.writeFile(filePath, workflowYaml);

    const options: LoadTaskSpecOptions = {
      validate: false,
    };

    // Should not throw even though workflow is invalid
    const workflow = await loadTaskSpec(filePath, options);
    expect(workflow.id).toBe('invalid-workflow-skip-validation');
  });

  it('should use custom safety policy when provided', async () => {
    const workflowYaml = `
id: permissive-workflow
name: Permissive Workflow
tasks:
  - id: critical-task
    name: Drop Database
    type: action
    riskTier: CRITICAL
  - id: next-task
    name: Send Notification
    type: action
    riskTier: LOW
dependencies:
  next-task:
    - critical-task
`;

    const filePath = path.join(TEST_DIR, 'permissive.yaml');
    await fs.promises.writeFile(filePath, workflowYaml);

    // Should fail with default policy
    await expect(loadTaskSpec(filePath)).rejects.toThrow(WorkflowValidationError);

    // Should pass with permissive policy (only checks cycles)
    const options: LoadTaskSpecOptions = {
      safetyPolicy: PERMISSIVE_SAFETY_POLICY,
    };
    
    const workflow = await loadTaskSpec(filePath, options);
    expect(workflow.id).toBe('permissive-workflow');
  });

  it('should reject workflow with cycle', async () => {
    const workflowYaml = `
id: cyclic-workflow
name: Workflow with Cycle
tasks:
  - id: task-a
    name: Task A
    type: action
  - id: task-b
    name: Task B
    type: action
dependencies:
  task-a:
    - task-b
  task-b:
    - task-a
`;

    const filePath = path.join(TEST_DIR, 'cyclic.yaml');
    await fs.promises.writeFile(filePath, workflowYaml);

    await expect(loadTaskSpec(filePath)).rejects.toThrow(WorkflowValidationError);
    
    try {
      await loadTaskSpec(filePath);
    } catch (error) {
      if (error instanceof WorkflowValidationError) {
        expect(error.result.violations[0].message).toContain('cycle');
      }
    }
  });

  it('should load workflow with embedded safety policy', async () => {
    const workflowYaml = `
id: workflow-with-policy
name: Workflow with Embedded Policy
safetyPolicy:
  name: custom-embedded
  description: Custom policy defined in workflow
  rules:
    - type: no_cycles
      enabled: true
      severity: error
tasks:
  - id: task-1
    name: Task 1
    type: action
    riskTier: LOW
dependencies: {}
`;

    const filePath = path.join(TEST_DIR, 'workflow-with-policy.yaml');
    await fs.promises.writeFile(filePath, workflowYaml);

    const workflow = await loadTaskSpec(filePath);
    
    expect(workflow.id).toBe('workflow-with-policy');
    expect(workflow.safetyPolicy).toBeDefined();
    expect(workflow.safetyPolicy?.name).toBe('custom-embedded');
  });

  it('should throw on warnings when strictWarnings is enabled', async () => {
    const workflowYaml = `
id: workflow-with-warnings
name: Workflow with Warnings
tasks:
  - id: critical-task
    name: Drop Database
    type: action
    riskTier: CRITICAL
    requiredPermissions:
      - action: admin
        resource: database
dependencies: {}
`;

    const filePath = path.join(TEST_DIR, 'workflow-warnings.yaml');
    await fs.promises.writeFile(filePath, workflowYaml);

    // Should pass by default (compensation is a warning in default policy)
    const workflow = await loadTaskSpec(filePath);
    expect(workflow.id).toBe('workflow-with-warnings');

    // Should throw when strictWarnings is enabled
    const options: LoadTaskSpecOptions = {
      strictWarnings: true,
    };
    
    await expect(loadTaskSpec(filePath, options)).rejects.toThrow(WorkflowValidationError);
  });

  it('should handle workflow with compensation action', async () => {
    const workflowYaml = `
id: workflow-comp-action
name: Workflow with Compensation Action
tasks:
  - id: critical-task
    name: Drop Database
    type: action
    riskTier: CRITICAL
    requiredPermissions:
      - action: admin
        resource: database
    compensationAction:
      tool: restore-db
      args:
        snapshot: latest
dependencies: {}
`;

    const filePath = path.join(TEST_DIR, 'workflow-comp-action.yaml');
    await fs.promises.writeFile(filePath, workflowYaml);

    const workflow = await loadTaskSpec(filePath);
    
    expect(workflow.id).toBe('workflow-comp-action');
    expect(workflow.tasks[0].compensationAction).toBeDefined();
    expect(workflow.tasks[0].compensationAction?.tool).toBe('restore-db');
  });
});
