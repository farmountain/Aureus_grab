import { describe, it, expect, beforeEach } from 'vitest';
import { GoalGuardFSM, RiskTier, GoalGuardState, Principal, Action, Permission, DataZone } from '../src';

describe('GoalGuardFSM', () => {
  let guardFSM: GoalGuardFSM;
  let principal: Principal;

  beforeEach(() => {
    guardFSM = new GoalGuardFSM();
    principal = {
      id: 'agent-1',
      type: 'agent',
      permissions: [
        { action: 'read', resource: 'database' },
        { action: 'write', resource: 'database' },
      ],
    };
  });

  it('should approve LOW risk actions', async () => {
    const action: Action = {
      id: 'read-1',
      name: 'Read Data',
      riskTier: RiskTier.LOW,
      requiredPermissions: [{ action: 'read', resource: 'database' }],
    };

    const decision = await guardFSM.evaluate(principal, action);
    
    expect(decision.allowed).toBe(true);
    expect(decision.requiresHumanApproval).toBe(false);
    expect(guardFSM.getState()).toBe(GoalGuardState.APPROVED);
  });

  it('should approve MEDIUM risk actions', async () => {
    const action: Action = {
      id: 'write-1',
      name: 'Write Data',
      riskTier: RiskTier.MEDIUM,
      requiredPermissions: [{ action: 'write', resource: 'database' }],
    };

    const decision = await guardFSM.evaluate(principal, action);
    
    expect(decision.allowed).toBe(true);
    expect(decision.requiresHumanApproval).toBe(false);
    expect(guardFSM.getState()).toBe(GoalGuardState.APPROVED);
  });

  it('should gate HIGH risk actions (invariant 4)', async () => {
    const action: Action = {
      id: 'delete-1',
      name: 'Delete Data',
      riskTier: RiskTier.HIGH,
      requiredPermissions: [{ action: 'write', resource: 'database' }],
    };

    const decision = await guardFSM.evaluate(principal, action);
    
    expect(decision.allowed).toBe(false);
    expect(decision.requiresHumanApproval).toBe(true);
    expect(guardFSM.getState()).toBe(GoalGuardState.PENDING_HUMAN);
  });

  it('should gate CRITICAL risk actions (invariant 4)', async () => {
    const action: Action = {
      id: 'drop-db',
      name: 'Drop Database',
      riskTier: RiskTier.CRITICAL,
      requiredPermissions: [{ action: 'write', resource: 'database' }],
    };

    const decision = await guardFSM.evaluate(principal, action);
    
    expect(decision.allowed).toBe(false);
    expect(decision.requiresHumanApproval).toBe(true);
    expect(guardFSM.getState()).toBe(GoalGuardState.PENDING_HUMAN);
  });

  it('should reject actions without required permissions', async () => {
    const action: Action = {
      id: 'admin-1',
      name: 'Admin Action',
      riskTier: RiskTier.LOW,
      requiredPermissions: [{ action: 'admin', resource: 'system' }],
    };

    const decision = await guardFSM.evaluate(principal, action);
    
    expect(decision.allowed).toBe(false);
    expect(decision.requiresHumanApproval).toBe(false);
    expect(guardFSM.getState()).toBe(GoalGuardState.REJECTED);
  });

  it('should maintain audit log (invariant 5)', async () => {
    const action1: Action = {
      id: 'action-1',
      name: 'Action 1',
      riskTier: RiskTier.LOW,
      requiredPermissions: [{ action: 'read', resource: 'database' }],
    };

    const action2: Action = {
      id: 'action-2',
      name: 'Action 2',
      riskTier: RiskTier.HIGH,
      requiredPermissions: [{ action: 'write', resource: 'database' }],
    };

    await guardFSM.evaluate(principal, action1);
    guardFSM.reset();
    await guardFSM.evaluate(principal, action2);

    const auditLog = guardFSM.getAuditLog();
    
    expect(auditLog).toHaveLength(2);
    expect(auditLog[0].action.id).toBe('action-1');
    expect(auditLog[1].action.id).toBe('action-2');
    expect(auditLog[0].decision.allowed).toBe(true);
    expect(auditLog[1].decision.allowed).toBe(false);
  });

  it('should allow human approval of pending actions', async () => {
    const action: Action = {
      id: 'high-risk',
      name: 'High Risk Action',
      riskTier: RiskTier.HIGH,
      requiredPermissions: [{ action: 'write', resource: 'database' }],
    };

    const decision = await guardFSM.evaluate(principal, action);
    expect(guardFSM.getState()).toBe(GoalGuardState.PENDING_HUMAN);
    expect(decision.approvalToken).toBeDefined();
    
    // Use the approval token
    const approved = guardFSM.approveHumanAction(action.id, decision.approvalToken!);
    expect(approved).toBe(true);
    expect(guardFSM.getState()).toBe(GoalGuardState.APPROVED);
  });

  it('should allow human rejection of pending actions', async () => {
    const action: Action = {
      id: 'high-risk-2',
      name: 'High Risk Action',
      riskTier: RiskTier.HIGH,
      requiredPermissions: [{ action: 'write', resource: 'database' }],
    };

    await guardFSM.evaluate(principal, action);
    expect(guardFSM.getState()).toBe(GoalGuardState.PENDING_HUMAN);

    guardFSM.rejectHumanAction();
    expect(guardFSM.getState()).toBe(GoalGuardState.REJECTED);
  });

  it('should reject approval with invalid token', async () => {
    const action: Action = {
      id: 'high-risk-3',
      name: 'High Risk Action',
      riskTier: RiskTier.HIGH,
      requiredPermissions: [{ action: 'write', resource: 'database' }],
    };

    await guardFSM.evaluate(principal, action);
    expect(guardFSM.getState()).toBe(GoalGuardState.PENDING_HUMAN);
    
    // Try to approve with wrong token
    const approved = guardFSM.approveHumanAction(action.id, 'wrong-token');
    expect(approved).toBe(false);
    expect(guardFSM.getState()).toBe(GoalGuardState.PENDING_HUMAN);
  });

  it('should reject reuse of approval token', async () => {
    const action: Action = {
      id: 'high-risk-4',
      name: 'High Risk Action',
      riskTier: RiskTier.HIGH,
      requiredPermissions: [{ action: 'write', resource: 'database' }],
    };

    const decision = await guardFSM.evaluate(principal, action);
    const token = decision.approvalToken!;
    
    // Use token once
    const approved1 = guardFSM.approveHumanAction(action.id, token);
    expect(approved1).toBe(true);
    
    // Reset and try to use same token again
    guardFSM.reset();
    await guardFSM.evaluate(principal, action);
    
    // Token should not work second time
    const approved2 = guardFSM.approveHumanAction(action.id, token);
    expect(approved2).toBe(false);
  });

  it('should validate allowed tools', async () => {
    const action: Action = {
      id: 'tool-restricted',
      name: 'Tool Restricted Action',
      riskTier: RiskTier.LOW,
      requiredPermissions: [{ action: 'read', resource: 'database' }],
      allowedTools: ['tool-a', 'tool-b'],
    };

    // Should reject with disallowed tool
    const decision1 = await guardFSM.evaluate(principal, action, 'tool-c');
    expect(decision1.allowed).toBe(false);
    expect(decision1.reason).toContain('not allowed');
    
    guardFSM.reset();
    
    // Should allow with allowed tool
    const decision2 = await guardFSM.evaluate(principal, action, 'tool-a');
    expect(decision2.allowed).toBe(true);
  });

  it('should validate data zone restrictions', async () => {
    const restrictedAction: Action = {
      id: 'restricted-data',
      name: 'Restricted Data Access',
      riskTier: RiskTier.MEDIUM,
      requiredPermissions: [{ 
        action: 'read', 
        resource: 'data',
        dataZone: DataZone.RESTRICTED
      }],
    };

    // Principal with only internal access should be rejected
    const decision = await guardFSM.evaluate(principal, restrictedAction);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('data zone');
  });
});
