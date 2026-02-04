import { describe, it, expect } from 'vitest';
import { WorkflowChecker, WorkflowValidationError } from '../src/workflow-checker';
import { WorkflowSpec, TaskSpec } from '../src/types';
import {
  SafetyPolicy,
  SafetyRuleType,
  DEFAULT_SAFETY_POLICY,
  STRICT_SAFETY_POLICY,
  PERMISSIVE_SAFETY_POLICY,
} from '../src/safety-policy';

describe('WorkflowChecker - Model Checking', () => {
  describe('No Action After CRITICAL Without Approval', () => {
    it('should pass when CRITICAL task has no followers', () => {
      const workflow: WorkflowSpec = {
        id: 'workflow-1',
        name: 'CRITICAL task without followers',
        tasks: [
          {
            id: 'critical-task',
            name: 'Drop Database',
            type: 'action',
            riskTier: 'CRITICAL',
            requiredPermissions: [{ action: 'admin', resource: 'database' }],
            compensation: {
              onFailure: 'rollback-task',
            },
          },
        ],
        dependencies: new Map(),
      };

      const result = WorkflowChecker.validate(workflow, DEFAULT_SAFETY_POLICY);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should pass when CRITICAL task is followed by its compensation task', () => {
      const workflow: WorkflowSpec = {
        id: 'workflow-2',
        name: 'CRITICAL task with compensation follower',
        tasks: [
          {
            id: 'critical-task',
            name: 'Drop Database',
            type: 'action',
            riskTier: 'CRITICAL',
            requiredPermissions: [{ action: 'admin', resource: 'database' }],
            compensation: {
              onFailure: 'rollback-task',
            },
          },
          {
            id: 'rollback-task',
            name: 'Rollback Database',
            type: 'action',
            riskTier: 'LOW',
          },
        ],
        dependencies: new Map([['rollback-task', ['critical-task']]]),
      };

      const result = WorkflowChecker.validate(workflow, DEFAULT_SAFETY_POLICY);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should pass when follower has compensationAction (is a cleanup task)', () => {
      const workflow: WorkflowSpec = {
        id: 'workflow-3',
        name: 'CRITICAL task followed by cleanup task',
        tasks: [
          {
            id: 'critical-task',
            name: 'Drop Database',
            type: 'action',
            riskTier: 'CRITICAL',
            requiredPermissions: [{ action: 'admin', resource: 'database' }],
            compensation: {
              onFailure: 'cleanup-task',
            },
          },
          {
            id: 'cleanup-task',
            name: 'Cleanup Resources',
            type: 'action',
            riskTier: 'LOW',
            compensationAction: {
              tool: 'cleanup',
              args: { resource: 'database' },
            },
          },
        ],
        dependencies: new Map([['cleanup-task', ['critical-task']]]),
      };

      const result = WorkflowChecker.validate(workflow, DEFAULT_SAFETY_POLICY);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should FAIL when CRITICAL task is followed by non-approved action', () => {
      const workflow: WorkflowSpec = {
        id: 'workflow-4',
        name: 'CRITICAL task followed by unapproved action',
        tasks: [
          {
            id: 'critical-task',
            name: 'Drop Database',
            type: 'action',
            riskTier: 'CRITICAL',
            requiredPermissions: [{ action: 'admin', resource: 'database' }],
            compensation: {
              onFailure: 'rollback-task',
            },
          },
          {
            id: 'next-task',
            name: 'Send Notification',
            type: 'action',
            riskTier: 'LOW',
          },
        ],
        dependencies: new Map([['next-task', ['critical-task']]]),
      };

      const result = WorkflowChecker.validate(workflow, DEFAULT_SAFETY_POLICY);
      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].ruleType).toBe(
        SafetyRuleType.NO_ACTION_AFTER_CRITICAL_WITHOUT_APPROVAL
      );
      expect(result.violations[0].taskIds).toEqual(['critical-task', 'next-task']);
      expect(result.violations[0].message).toContain('next-task');
      expect(result.violations[0].message).toContain('critical-task');
    });

    it('should pass when follower is in approved list', () => {
      const policy: SafetyPolicy = {
        name: 'custom',
        rules: [
          {
            type: SafetyRuleType.NO_ACTION_AFTER_CRITICAL_WITHOUT_APPROVAL,
            enabled: true,
            severity: 'error',
            approvedFollowers: ['notification-task'],
          },
        ],
      };

      const workflow: WorkflowSpec = {
        id: 'workflow-5',
        name: 'CRITICAL task with approved follower',
        tasks: [
          {
            id: 'critical-task',
            name: 'Drop Database',
            type: 'action',
            riskTier: 'CRITICAL',
            requiredPermissions: [{ action: 'admin', resource: 'database' }],
            compensation: {
              onFailure: 'rollback-task',
            },
          },
          {
            id: 'notification-task',
            name: 'Send Notification',
            type: 'action',
            riskTier: 'LOW',
          },
        ],
        dependencies: new Map([['notification-task', ['critical-task']]]),
      };

      const result = WorkflowChecker.validate(workflow, policy);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should FAIL for multiple unapproved followers', () => {
      const workflow: WorkflowSpec = {
        id: 'workflow-6',
        name: 'CRITICAL task with multiple unapproved followers',
        tasks: [
          {
            id: 'critical-task',
            name: 'Drop Database',
            type: 'action',
            riskTier: 'CRITICAL',
            requiredPermissions: [{ action: 'admin', resource: 'database' }],
            compensation: {
              onFailure: 'rollback-task',
            },
          },
          {
            id: 'task-a',
            name: 'Task A',
            type: 'action',
            riskTier: 'LOW',
          },
          {
            id: 'task-b',
            name: 'Task B',
            type: 'action',
            riskTier: 'LOW',
          },
        ],
        dependencies: new Map([
          ['task-a', ['critical-task']],
          ['task-b', ['critical-task']],
        ]),
      };

      const result = WorkflowChecker.validate(workflow, DEFAULT_SAFETY_POLICY);
      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(2);
    });
  });

  describe('Require Permissions for HIGH/CRITICAL Risk', () => {
    it('should pass when HIGH risk task has permissions', () => {
      const workflow: WorkflowSpec = {
        id: 'workflow-7',
        name: 'HIGH risk with permissions',
        tasks: [
          {
            id: 'high-risk-task',
            name: 'Modify Data',
            type: 'action',
            riskTier: 'HIGH',
            requiredPermissions: [{ action: 'write', resource: 'data' }],
          },
        ],
        dependencies: new Map(),
      };

      const result = WorkflowChecker.validate(workflow, DEFAULT_SAFETY_POLICY);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should FAIL when HIGH risk task lacks permissions', () => {
      const workflow: WorkflowSpec = {
        id: 'workflow-8',
        name: 'HIGH risk without permissions',
        tasks: [
          {
            id: 'high-risk-task',
            name: 'Modify Data',
            type: 'action',
            riskTier: 'HIGH',
          },
        ],
        dependencies: new Map(),
      };

      const result = WorkflowChecker.validate(workflow, DEFAULT_SAFETY_POLICY);
      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].ruleType).toBe(
        SafetyRuleType.REQUIRE_PERMISSIONS_FOR_HIGH_RISK
      );
      expect(result.violations[0].taskIds).toEqual(['high-risk-task']);
    });

    it('should FAIL when CRITICAL risk task lacks permissions', () => {
      const workflow: WorkflowSpec = {
        id: 'workflow-9',
        name: 'CRITICAL risk without permissions',
        tasks: [
          {
            id: 'critical-task',
            name: 'Drop Database',
            type: 'action',
            riskTier: 'CRITICAL',
            compensation: {
              onFailure: 'rollback',
            },
          },
        ],
        dependencies: new Map(),
      };

      const result = WorkflowChecker.validate(workflow, DEFAULT_SAFETY_POLICY);
      expect(result.valid).toBe(false);
      expect(result.violations.some(v => 
        v.ruleType === SafetyRuleType.REQUIRE_PERMISSIONS_FOR_HIGH_RISK
      )).toBe(true);
    });

    it('should pass when LOW/MEDIUM risk tasks lack permissions', () => {
      const workflow: WorkflowSpec = {
        id: 'workflow-10',
        name: 'LOW/MEDIUM risk without permissions',
        tasks: [
          {
            id: 'low-risk-task',
            name: 'Read Data',
            type: 'action',
            riskTier: 'LOW',
          },
          {
            id: 'medium-risk-task',
            name: 'Update Config',
            type: 'action',
            riskTier: 'MEDIUM',
          },
        ],
        dependencies: new Map(),
      };

      const result = WorkflowChecker.validate(workflow, DEFAULT_SAFETY_POLICY);
      expect(result.valid).toBe(true);
    });
  });

  describe('Require Compensation for CRITICAL', () => {
    it('should warn when CRITICAL task lacks compensation (default policy)', () => {
      const workflow: WorkflowSpec = {
        id: 'workflow-11',
        name: 'CRITICAL without compensation',
        tasks: [
          {
            id: 'critical-task',
            name: 'Drop Database',
            type: 'action',
            riskTier: 'CRITICAL',
            requiredPermissions: [{ action: 'admin', resource: 'database' }],
          },
        ],
        dependencies: new Map(),
      };

      const result = WorkflowChecker.validate(workflow, DEFAULT_SAFETY_POLICY);
      // Default policy has this as a warning
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].ruleType).toBe(
        SafetyRuleType.REQUIRE_COMPENSATION_FOR_CRITICAL
      );
    });

    it('should FAIL when CRITICAL task lacks compensation (strict policy)', () => {
      const workflow: WorkflowSpec = {
        id: 'workflow-12',
        name: 'CRITICAL without compensation',
        tasks: [
          {
            id: 'critical-task',
            name: 'Drop Database',
            type: 'action',
            riskTier: 'CRITICAL',
            requiredPermissions: [{ action: 'admin', resource: 'database' }],
          },
        ],
        dependencies: new Map(),
      };

      const result = WorkflowChecker.validate(workflow, STRICT_SAFETY_POLICY);
      expect(result.valid).toBe(false);
      expect(result.violations.some(v => 
        v.ruleType === SafetyRuleType.REQUIRE_COMPENSATION_FOR_CRITICAL
      )).toBe(true);
    });

    it('should pass when CRITICAL task has compensation hook', () => {
      const workflow: WorkflowSpec = {
        id: 'workflow-13',
        name: 'CRITICAL with compensation hook',
        tasks: [
          {
            id: 'critical-task',
            name: 'Drop Database',
            type: 'action',
            riskTier: 'CRITICAL',
            requiredPermissions: [{ action: 'admin', resource: 'database' }],
            compensation: {
              onFailure: 'rollback',
            },
          },
        ],
        dependencies: new Map(),
      };

      const result = WorkflowChecker.validate(workflow, STRICT_SAFETY_POLICY);
      expect(result.violations.some(v => 
        v.ruleType === SafetyRuleType.REQUIRE_COMPENSATION_FOR_CRITICAL
      )).toBe(false);
    });

    it('should pass when CRITICAL task has compensation action', () => {
      const workflow: WorkflowSpec = {
        id: 'workflow-14',
        name: 'CRITICAL with compensation action',
        tasks: [
          {
            id: 'critical-task',
            name: 'Drop Database',
            type: 'action',
            riskTier: 'CRITICAL',
            requiredPermissions: [{ action: 'admin', resource: 'database' }],
            compensationAction: {
              tool: 'restore-db',
              args: { snapshot: 'latest' },
            },
          },
        ],
        dependencies: new Map(),
      };

      const result = WorkflowChecker.validate(workflow, STRICT_SAFETY_POLICY);
      expect(result.violations.some(v => 
        v.ruleType === SafetyRuleType.REQUIRE_COMPENSATION_FOR_CRITICAL
      )).toBe(false);
    });
  });

  describe('No Cycles in DAG', () => {
    it('should pass for valid DAG', () => {
      const workflow: WorkflowSpec = {
        id: 'workflow-15',
        name: 'Valid DAG',
        tasks: [
          { id: 'task-a', name: 'Task A', type: 'action' },
          { id: 'task-b', name: 'Task B', type: 'action' },
          { id: 'task-c', name: 'Task C', type: 'action' },
        ],
        dependencies: new Map([
          ['task-b', ['task-a']],
          ['task-c', ['task-b']],
        ]),
      };

      const result = WorkflowChecker.validate(workflow, DEFAULT_SAFETY_POLICY);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should FAIL for simple cycle', () => {
      const workflow: WorkflowSpec = {
        id: 'workflow-16',
        name: 'Workflow with cycle',
        tasks: [
          { id: 'task-a', name: 'Task A', type: 'action' },
          { id: 'task-b', name: 'Task B', type: 'action' },
        ],
        dependencies: new Map([
          ['task-a', ['task-b']],
          ['task-b', ['task-a']],
        ]),
      };

      const result = WorkflowChecker.validate(workflow, DEFAULT_SAFETY_POLICY);
      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].ruleType).toBe(SafetyRuleType.NO_CYCLES);
    });

    it('should FAIL for self-referencing task', () => {
      const workflow: WorkflowSpec = {
        id: 'workflow-17',
        name: 'Self-referencing task',
        tasks: [
          { id: 'task-a', name: 'Task A', type: 'action' },
        ],
        dependencies: new Map([
          ['task-a', ['task-a']],
        ]),
      };

      const result = WorkflowChecker.validate(workflow, DEFAULT_SAFETY_POLICY);
      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].ruleType).toBe(SafetyRuleType.NO_CYCLES);
    });
  });

  describe('Policy Configuration', () => {
    it('should respect disabled rules', () => {
      const policy: SafetyPolicy = {
        name: 'permissive',
        rules: [
          {
            type: SafetyRuleType.NO_ACTION_AFTER_CRITICAL_WITHOUT_APPROVAL,
            enabled: false, // Disabled
            severity: 'error',
          },
        ],
      };

      const workflow: WorkflowSpec = {
        id: 'workflow-18',
        name: 'CRITICAL with unapproved follower',
        tasks: [
          {
            id: 'critical-task',
            name: 'Drop Database',
            type: 'action',
            riskTier: 'CRITICAL',
            requiredPermissions: [{ action: 'admin', resource: 'database' }],
            compensation: { onFailure: 'rollback' },
          },
          {
            id: 'next-task',
            name: 'Next Task',
            type: 'action',
            riskTier: 'LOW',
          },
        ],
        dependencies: new Map([['next-task', ['critical-task']]]),
      };

      const result = WorkflowChecker.validate(workflow, policy);
      expect(result.valid).toBe(true);
    });

    it('should use PERMISSIVE_SAFETY_POLICY correctly', () => {
      const workflow: WorkflowSpec = {
        id: 'workflow-19',
        name: 'CRITICAL without permissions or compensation',
        tasks: [
          {
            id: 'critical-task',
            name: 'Drop Database',
            type: 'action',
            riskTier: 'CRITICAL',
          },
          {
            id: 'next-task',
            name: 'Next Task',
            type: 'action',
            riskTier: 'LOW',
          },
        ],
        dependencies: new Map([['next-task', ['critical-task']]]),
      };

      const result = WorkflowChecker.validate(workflow, PERMISSIVE_SAFETY_POLICY);
      // Permissive policy only checks for cycles
      expect(result.valid).toBe(true);
    });
  });

  describe('Format Validation Result', () => {
    it('should format successful validation', () => {
      const workflow: WorkflowSpec = {
        id: 'workflow-20',
        name: 'Valid workflow',
        tasks: [
          { id: 'task-a', name: 'Task A', type: 'action', riskTier: 'LOW' },
        ],
        dependencies: new Map(),
      };

      const result = WorkflowChecker.validate(workflow, DEFAULT_SAFETY_POLICY);
      const formatted = WorkflowChecker.formatValidationResult(result);
      
      expect(formatted).toContain('Safety Validation Result');
      expect(formatted).toContain('All safety checks passed');
    });

    it('should format violations and warnings', () => {
      const workflow: WorkflowSpec = {
        id: 'workflow-21',
        name: 'Workflow with violations',
        tasks: [
          {
            id: 'critical-task',
            name: 'Drop Database',
            type: 'action',
            riskTier: 'CRITICAL',
          },
        ],
        dependencies: new Map(),
      };

      const result = WorkflowChecker.validate(workflow, DEFAULT_SAFETY_POLICY);
      const formatted = WorkflowChecker.formatValidationResult(result);
      
      expect(formatted).toContain('Error(s)');
      expect(formatted).toContain('Warning(s)');
    });
  });

  describe('Custom Rules', () => {
    it('should support custom validation rules', () => {
      const policy: SafetyPolicy = {
        name: 'custom',
        rules: [
          {
            type: SafetyRuleType.CUSTOM,
            enabled: true,
            severity: 'error',
            validate: (workflow: WorkflowSpec) => {
              // Custom rule: workflows must have at least 2 tasks
              if (workflow.tasks.length < 2) {
                return [{
                  ruleType: SafetyRuleType.CUSTOM,
                  severity: 'error',
                  message: 'Workflow must have at least 2 tasks',
                  taskIds: [],
                }];
              }
              return [];
            },
          },
        ],
      };

      const workflow: WorkflowSpec = {
        id: 'workflow-22',
        name: 'Single task workflow',
        tasks: [
          { id: 'task-a', name: 'Task A', type: 'action' },
        ],
        dependencies: new Map(),
      };

      const result = WorkflowChecker.validate(workflow, policy);
      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].message).toContain('at least 2 tasks');
    });
  });
});
