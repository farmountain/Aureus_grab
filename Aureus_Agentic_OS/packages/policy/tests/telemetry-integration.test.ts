import { describe, it, expect, beforeEach } from 'vitest';
import { TelemetryCollector, TelemetryEventType } from '@aureus/observability';
import { GoalGuardFSM, Principal, Action, RiskTier } from '../src';

describe('Policy Telemetry Integration', () => {
  let telemetry: TelemetryCollector;
  let policyGuard: GoalGuardFSM;
  let principal: Principal;

  beforeEach(() => {
    telemetry = new TelemetryCollector();
    policyGuard = new GoalGuardFSM(telemetry);
    
    principal = {
      id: 'user-1',
      name: 'Test User',
      permissions: [
        { action: 'read', resource: 'data' },
        { action: 'write', resource: 'data' },
      ],
    };
  });

  it('should record telemetry when evaluating actions', async () => {
    const action: Action = {
      id: 'action-1',
      name: 'Read Data',
      riskTier: RiskTier.LOW,
      requiredPermissions: [
        { action: 'read', resource: 'data' },
      ],
    };

    await policyGuard.evaluate(principal, action, undefined, 'wf-1', 'task-1');

    const events = telemetry.getEventsByType(TelemetryEventType.POLICY_CHECK);
    expect(events).toHaveLength(1);
    expect(events[0].workflowId).toBe('wf-1');
    expect(events[0].taskId).toBe('task-1');
    expect(events[0].data.allowed).toBe(true);
    expect(events[0].data.requiresHumanApproval).toBe(false);
  });

  it('should record rejection in telemetry', async () => {
    const action: Action = {
      id: 'action-2',
      name: 'Admin Action',
      riskTier: RiskTier.LOW,
      requiredPermissions: [
        { action: 'admin', resource: 'system' }, // User doesn't have this permission
      ],
    };

    await policyGuard.evaluate(principal, action, undefined, 'wf-2', 'task-2');

    const events = telemetry.getEventsByType(TelemetryEventType.POLICY_CHECK);
    expect(events).toHaveLength(1);
    expect(events[0].data.allowed).toBe(false);
  });

  it('should record human approval requirement', async () => {
    const action: Action = {
      id: 'action-3',
      name: 'High Risk Action',
      riskTier: RiskTier.HIGH, // High risk requires human approval
      requiredPermissions: [
        { action: 'write', resource: 'data' },
      ],
    };

    await policyGuard.evaluate(principal, action, undefined, 'wf-3', 'task-3');

    const events = telemetry.getEventsByType(TelemetryEventType.POLICY_CHECK);
    expect(events).toHaveLength(1);
    expect(events[0].data.requiresHumanApproval).toBe(true);
  });

  it('should fall back to metadata when workflowId/taskId not provided', async () => {
    const action: Action = {
      id: 'action-4',
      name: 'Test Action',
      riskTier: RiskTier.LOW,
      requiredPermissions: [
        { action: 'read', resource: 'data' },
      ],
      metadata: {
        workflowId: 'wf-metadata',
        taskId: 'task-metadata',
      },
    };

    await policyGuard.evaluate(principal, action); // No explicit workflowId/taskId

    const events = telemetry.getEventsByType(TelemetryEventType.POLICY_CHECK);
    expect(events).toHaveLength(1);
    expect(events[0].workflowId).toBe('wf-metadata');
    expect(events[0].taskId).toBe('task-metadata');
  });

  it('should not record telemetry when workflowId/taskId missing', async () => {
    const action: Action = {
      id: 'action-5',
      name: 'Test Action',
      riskTier: RiskTier.LOW,
      requiredPermissions: [
        { action: 'read', resource: 'data' },
      ],
    };

    await policyGuard.evaluate(principal, action); // No workflowId/taskId

    const events = telemetry.getEventsByType(TelemetryEventType.POLICY_CHECK);
    expect(events).toHaveLength(0); // Should not record without proper IDs
  });
});
