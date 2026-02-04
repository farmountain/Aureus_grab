import { describe, it, expect, beforeEach } from 'vitest';
import { 
  ConstraintEngine, 
  HardConstraint, 
  SoftConstraint,
  ConstraintCategory 
} from '../src/constraints';
import { WorldState } from '../src/index';

describe('ConstraintEngine', () => {
  let engine: ConstraintEngine;
  let testState: WorldState;

  beforeEach(() => {
    engine = new ConstraintEngine();
    testState = {
      id: 'state-1',
      entities: new Map([
        ['user:1', {
          id: 'user:1',
          type: 'User',
          properties: { name: 'Alice', role: 'admin', budget: 1000 },
        }],
        ['resource:1', {
          id: 'resource:1',
          type: 'Resource',
          properties: { owner: 'user:1', zone: 'us-east' },
        }],
      ]),
      relationships: [],
      constraints: [],
      timestamp: new Date(),
    };
  });

  describe('Hard Constraints', () => {
    it('should add and validate a hard constraint', () => {
      const constraint: HardConstraint = {
        id: 'admin-required',
        description: 'At least one admin user must exist',
        category: 'policy',
        severity: 'hard',
        predicate: (state) => {
          const users = Array.from(state.entities.values());
          return users.some(u => u.properties.role === 'admin');
        },
        violationMessage: 'No admin user found',
      };

      engine.addHardConstraint(constraint);
      const result = engine.validate(testState);

      expect(result.satisfied).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.details).toHaveLength(1);
      expect(result.details[0].satisfied).toBe(true);
    });

    it('should detect hard constraint violations', () => {
      const constraint: HardConstraint = {
        id: 'budget-limit',
        description: 'Budget must not exceed 500',
        category: 'policy',
        severity: 'hard',
        predicate: (state) => {
          const user = state.entities.get('user:1');
          return user ? (user.properties.budget as number) <= 500 : true;
        },
        violationMessage: 'Budget exceeds limit',
      };

      engine.addHardConstraint(constraint);
      const result = engine.validate(testState);

      expect(result.satisfied).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].constraintId).toBe('budget-limit');
      expect(result.violations[0].severity).toBe('hard');
      expect(result.violations[0].message).toBe('Budget exceeds limit');
    });

    it('should check action-specific hard constraints', () => {
      const constraint: HardConstraint = {
        id: 'delete-permission',
        description: 'Only admins can delete resources',
        category: 'policy',
        severity: 'hard',
        predicate: (state, action) => {
          if (action !== 'delete-resource') return true;
          const users = Array.from(state.entities.values());
          return users.some(u => u.properties.role === 'admin');
        },
      };

      engine.addHardConstraint(constraint);

      const readResult = engine.validate(testState, 'read-resource');
      expect(readResult.satisfied).toBe(true);

      const deleteResult = engine.validate(testState, 'delete-resource');
      expect(deleteResult.satisfied).toBe(true); // Has admin

      // Remove admin role
      const user = testState.entities.get('user:1');
      if (user) user.properties.role = 'user';

      const deleteResultNoAdmin = engine.validate(testState, 'delete-resource');
      expect(deleteResultNoAdmin.satisfied).toBe(false);
    });

    it('should use isActionAllowed for quick checks', () => {
      const constraint: HardConstraint = {
        id: 'zone-access',
        description: 'Can only access us-east zone',
        category: 'data_zone',
        severity: 'hard',
        predicate: (state, action, params) => {
          if (action !== 'access-resource') return true;
          const zone = params?.zone as string;
          return zone === 'us-east';
        },
      };

      engine.addHardConstraint(constraint);

      expect(engine.isActionAllowed(testState, 'access-resource', { zone: 'us-east' })).toBe(true);
      expect(engine.isActionAllowed(testState, 'access-resource', { zone: 'eu-west' })).toBe(false);
      expect(engine.isActionAllowed(testState, 'other-action')).toBe(true);
    });
  });

  describe('Soft Constraints', () => {
    it('should add and evaluate a soft constraint', () => {
      const constraint: SoftConstraint = {
        id: 'cost-optimization',
        description: 'Prefer lower cost actions',
        category: 'cost',
        severity: 'soft',
        score: (state, action, params) => {
          const cost = (params?.cost as number) || 0;
          // Score inversely proportional to cost (max cost = 1000)
          return Math.max(0, 1 - cost / 1000);
        },
        weight: 2.0,
      };

      engine.addSoftConstraint(constraint);
      
      const lowCostResult = engine.validate(testState, 'action', { cost: 100 });
      expect(lowCostResult.satisfied).toBe(true);
      expect(lowCostResult.score).toBeCloseTo(0.9, 1);

      const highCostResult = engine.validate(testState, 'action', { cost: 900 });
      expect(highCostResult.satisfied).toBe(true);
      expect(highCostResult.score).toBeCloseTo(0.1, 1);
    });

    it('should compute weighted scores for multiple soft constraints', () => {
      const costConstraint: SoftConstraint = {
        id: 'cost',
        description: 'Minimize cost',
        category: 'cost',
        severity: 'soft',
        score: (state, action, params) => {
          const cost = (params?.cost as number) || 0;
          return 1 - cost / 1000;
        },
        weight: 2.0,
      };

      const timeConstraint: SoftConstraint = {
        id: 'time',
        description: 'Minimize time',
        category: 'time',
        severity: 'soft',
        score: (state, action, params) => {
          const time = (params?.time as number) || 0;
          return 1 - time / 100;
        },
        weight: 1.0,
      };

      engine.addSoftConstraint(costConstraint);
      engine.addSoftConstraint(timeConstraint);

      // cost: 500 -> score 0.5, weight 2.0 -> 1.0
      // time: 50 -> score 0.5, weight 1.0 -> 0.5
      // total: 1.5 / 3.0 = 0.5
      const result = engine.validate(testState, 'action', { cost: 500, time: 50 });
      expect(result.satisfied).toBe(true);
      expect(result.score).toBeCloseTo(0.5, 2);
    });

    it('should detect soft constraint violations with minScore', () => {
      const constraint: SoftConstraint = {
        id: 'risk-threshold',
        description: 'Risk must be below 0.3',
        category: 'risk',
        severity: 'soft',
        score: (state, action, params) => {
          const risk = (params?.risk as number) || 0;
          return 1 - risk;
        },
        minScore: 0.7, // Requires risk < 0.3
      };

      engine.addSoftConstraint(constraint);

      const lowRiskResult = engine.validate(testState, 'action', { risk: 0.2 });
      expect(lowRiskResult.satisfied).toBe(true);
      expect(lowRiskResult.violations).toHaveLength(0);

      const highRiskResult = engine.validate(testState, 'action', { risk: 0.5 });
      expect(highRiskResult.satisfied).toBe(false);
      expect(highRiskResult.violations).toHaveLength(1);
      expect(highRiskResult.violations[0].severity).toBe('soft');
    });

    it('should get action score for optimization', () => {
      const constraint: SoftConstraint = {
        id: 'efficiency',
        description: 'Prefer efficient actions',
        category: 'cost',
        severity: 'soft',
        score: (state, action, params) => {
          const efficiency = (params?.efficiency as number) || 0.5;
          return efficiency;
        },
      };

      engine.addSoftConstraint(constraint);

      const score1 = engine.getActionScore(testState, 'action', { efficiency: 0.8 });
      expect(score1).toBe(0.8);

      const score2 = engine.getActionScore(testState, 'action', { efficiency: 0.3 });
      expect(score2).toBe(0.3);
    });
  });

  describe('Constraint Management', () => {
    it('should remove constraints', () => {
      const constraint: HardConstraint = {
        id: 'test-constraint',
        description: 'Test',
        category: 'custom',
        severity: 'hard',
        predicate: () => false,
      };

      engine.addHardConstraint(constraint);
      expect(engine.getAllConstraints()).toHaveLength(1);

      const removed = engine.removeConstraint('test-constraint');
      expect(removed).toBe(true);
      expect(engine.getAllConstraints()).toHaveLength(0);

      const removedAgain = engine.removeConstraint('test-constraint');
      expect(removedAgain).toBe(false);
    });

    it('should get constraints by category', () => {
      const policyConstraint: HardConstraint = {
        id: 'policy-1',
        description: 'Policy constraint',
        category: 'policy',
        severity: 'hard',
        predicate: () => true,
      };

      const costConstraint: SoftConstraint = {
        id: 'cost-1',
        description: 'Cost constraint',
        category: 'cost',
        severity: 'soft',
        score: () => 1.0,
      };

      engine.addHardConstraint(policyConstraint);
      engine.addSoftConstraint(costConstraint);

      const policyConstraints = engine.getConstraintsByCategory('policy');
      expect(policyConstraints).toHaveLength(1);
      expect(policyConstraints[0].id).toBe('policy-1');

      const costConstraints = engine.getConstraintsByCategory('cost');
      expect(costConstraints).toHaveLength(1);
      expect(costConstraints[0].id).toBe('cost-1');
    });

    it('should get constraints by severity', () => {
      const hardConstraint: HardConstraint = {
        id: 'hard-1',
        description: 'Hard constraint',
        category: 'policy',
        severity: 'hard',
        predicate: () => true,
      };

      const softConstraint: SoftConstraint = {
        id: 'soft-1',
        description: 'Soft constraint',
        category: 'cost',
        severity: 'soft',
        score: () => 1.0,
      };

      engine.addHardConstraint(hardConstraint);
      engine.addSoftConstraint(softConstraint);

      const hardConstraints = engine.getConstraintsBySeverity('hard');
      expect(hardConstraints).toHaveLength(1);
      expect(hardConstraints[0].id).toBe('hard-1');

      const softConstraints = engine.getConstraintsBySeverity('soft');
      expect(softConstraints).toHaveLength(1);
      expect(softConstraints[0].id).toBe('soft-1');
    });

    it('should clear all constraints', () => {
      engine.addHardConstraint({
        id: 'hard-1',
        description: 'Hard',
        category: 'policy',
        severity: 'hard',
        predicate: () => true,
      });

      engine.addSoftConstraint({
        id: 'soft-1',
        description: 'Soft',
        category: 'cost',
        severity: 'soft',
        score: () => 1.0,
      });

      expect(engine.getAllConstraints()).toHaveLength(2);

      engine.clear();
      expect(engine.getAllConstraints()).toHaveLength(0);
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle mixed hard and soft constraints', () => {
      // Hard constraint: must have admin
      engine.addHardConstraint({
        id: 'admin-required',
        description: 'Admin required',
        category: 'policy',
        severity: 'hard',
        predicate: (state) => {
          const users = Array.from(state.entities.values());
          return users.some(u => u.properties.role === 'admin');
        },
      });

      // Soft constraint: prefer low cost
      engine.addSoftConstraint({
        id: 'cost-opt',
        description: 'Minimize cost',
        category: 'cost',
        severity: 'soft',
        score: (state, action, params) => 1 - ((params?.cost as number) || 0) / 100,
        weight: 1.0,
      });

      // Soft constraint: prefer low risk
      engine.addSoftConstraint({
        id: 'risk-opt',
        description: 'Minimize risk',
        category: 'risk',
        severity: 'soft',
        score: (state, action, params) => 1 - ((params?.risk as number) || 0),
        weight: 1.0,
      });

      const result = engine.validate(testState, 'action', { cost: 50, risk: 0.2 });

      expect(result.satisfied).toBe(true);
      expect(result.violations).toHaveLength(0);
      // cost: 50 -> 0.5, risk: 0.2 -> 0.8, average: 0.65
      expect(result.score).toBeCloseTo(0.65, 2);
      expect(result.details).toHaveLength(3);
    });
  });
});
