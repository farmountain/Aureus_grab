import { describe, it, expect, beforeEach } from 'vitest';
import { 
  PlanningEngine, 
  ActionDefinition,
  PlanningOptions 
} from '../src/planning';
import { ConstraintEngine, HardConstraint, SoftConstraint } from '../src/constraints';
import { WorldState } from '../src/index';

describe('PlanningEngine', () => {
  let engine: PlanningEngine;
  let constraintEngine: ConstraintEngine;
  let testState: WorldState;

  beforeEach(() => {
    constraintEngine = new ConstraintEngine();
    engine = new PlanningEngine(constraintEngine);
    
    testState = {
      id: 'state-1',
      entities: new Map([
        ['user:1', {
          id: 'user:1',
          type: 'User',
          properties: { name: 'Alice', role: 'admin', budget: 500 },
        }],
      ]),
      relationships: [],
      constraints: [],
      timestamp: new Date(),
    };
  });

  describe('Action Management', () => {
    it('should register and retrieve actions', () => {
      const action: ActionDefinition = {
        id: 'create-user',
        name: 'Create User',
        description: 'Create a new user',
        cost: 10,
        timeEstimate: 5,
      };

      engine.registerAction(action);

      const retrieved = engine.getAction('create-user');
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe('create-user');
      expect(retrieved!.name).toBe('Create User');
    });

    it('should unregister actions', () => {
      const action: ActionDefinition = {
        id: 'test-action',
        name: 'Test',
        description: 'Test action',
      };

      engine.registerAction(action);
      expect(engine.getAction('test-action')).toBeDefined();

      const removed = engine.unregisterAction('test-action');
      expect(removed).toBe(true);
      expect(engine.getAction('test-action')).toBeUndefined();
    });

    it('should get all registered actions', () => {
      engine.registerAction({
        id: 'action-1',
        name: 'Action 1',
        description: 'First action',
      });

      engine.registerAction({
        id: 'action-2',
        name: 'Action 2',
        description: 'Second action',
      });

      const actions = engine.getAllActions();
      expect(actions).toHaveLength(2);
      expect(actions.map(a => a.id)).toContain('action-1');
      expect(actions.map(a => a.id)).toContain('action-2');
    });
  });

  describe('Available Actions Query', () => {
    beforeEach(() => {
      // Register some test actions
      engine.registerAction({
        id: 'read-data',
        name: 'Read Data',
        description: 'Read data from database',
        cost: 1,
        timeEstimate: 2,
        riskLevel: 0.1,
      });

      engine.registerAction({
        id: 'write-data',
        name: 'Write Data',
        description: 'Write data to database',
        cost: 5,
        timeEstimate: 5,
        riskLevel: 0.3,
      });

      engine.registerAction({
        id: 'delete-data',
        name: 'Delete Data',
        description: 'Delete data from database',
        cost: 2,
        timeEstimate: 3,
        riskLevel: 0.8,
      });
    });

    it('should return all actions when no constraints', () => {
      const result = engine.getAvailableActions(testState);

      expect(result.allowed).toHaveLength(3);
      expect(result.blocked).toHaveLength(0);
    });

    it('should filter actions based on hard constraints', () => {
      // Add constraint: only admins can delete
      const constraint: HardConstraint = {
        id: 'delete-permission',
        description: 'Only admins can delete',
        category: 'policy',
        severity: 'hard',
        predicate: (state, action) => {
          if (action !== 'delete-data') return true;
          const users = Array.from(state.entities.values());
          return users.some(u => u.properties.role === 'admin');
        },
      };

      constraintEngine.addHardConstraint(constraint);

      const result = engine.getAvailableActions(testState);
      expect(result.allowed).toHaveLength(3); // Has admin

      // Remove admin role
      const user = testState.entities.get('user:1');
      if (user) user.properties.role = 'user';

      const resultNoAdmin = engine.getAvailableActions(testState);
      expect(resultNoAdmin.allowed).toHaveLength(2);
      expect(resultNoAdmin.blocked).toHaveLength(1);
      expect(resultNoAdmin.blocked[0].action.id).toBe('delete-data');
    });

    it('should score actions based on soft constraints', () => {
      // Add cost optimization constraint
      const constraint: SoftConstraint = {
        id: 'cost-opt',
        description: 'Prefer lower cost',
        category: 'cost',
        severity: 'soft',
        score: (state, action, params) => {
          const actionDef = engine.getAction(action!);
          const cost = actionDef?.cost || 0;
          return 1 - cost / 10; // Lower cost = higher score
        },
      };

      constraintEngine.addSoftConstraint(constraint);

      const result = engine.getAvailableActions(testState);
      
      // Should be sorted by score (descending)
      // read-data: cost 1 -> score 0.9
      // delete-data: cost 2 -> score 0.8
      // write-data: cost 5 -> score 0.5
      expect(result.allowed[0].action.id).toBe('read-data');
      expect(result.allowed[0].score).toBeCloseTo(0.9, 1);
      expect(result.allowed[2].action.id).toBe('write-data');
      expect(result.allowed[2].score).toBeCloseTo(0.5, 1);
    });

    it('should check action preconditions', () => {
      engine.registerAction({
        id: 'admin-action',
        name: 'Admin Action',
        description: 'Action requiring admin role',
        preconditions: [
          (state) => {
            const users = Array.from(state.entities.values());
            return users.some(u => u.properties.role === 'admin');
          },
        ],
      });

      const result = engine.getAvailableActions(testState);
      const adminAction = result.allowed.find(a => a.action.id === 'admin-action');
      expect(adminAction).toBeDefined();
      expect(adminAction!.allowed).toBe(true);

      // Remove admin
      const user = testState.entities.get('user:1');
      if (user) user.properties.role = 'user';

      const resultNoAdmin = engine.getAvailableActions(testState);
      const adminActionBlocked = resultNoAdmin.blocked.find(a => a.action.id === 'admin-action');
      expect(adminActionBlocked).toBeDefined();
    });

    it('should support filtering by category', () => {
      engine.registerAction({
        id: 'cat-a',
        name: 'Category A',
        description: 'Action in category A',
        metadata: { category: 'categoryA' },
      });

      engine.registerAction({
        id: 'cat-b',
        name: 'Category B',
        description: 'Action in category B',
        metadata: { category: 'categoryB' },
      });

      const options: PlanningOptions = {
        category: 'categoryA',
      };

      const result = engine.getAvailableActions(testState, options);
      expect(result.allowed).toHaveLength(1);
      expect(result.allowed[0].action.id).toBe('cat-a');
    });

    it('should support filtering by tags', () => {
      engine.registerAction({
        id: 'tagged-1',
        name: 'Tagged 1',
        description: 'Action with tag1',
        metadata: { tags: ['tag1', 'tag2'] },
      });

      engine.registerAction({
        id: 'tagged-2',
        name: 'Tagged 2',
        description: 'Action with tag2',
        metadata: { tags: ['tag2', 'tag3'] },
      });

      engine.registerAction({
        id: 'untagged',
        name: 'Untagged',
        description: 'Action without tags',
      });

      const options: PlanningOptions = {
        tags: ['tag1'],
      };

      const result = engine.getAvailableActions(testState, options);
      expect(result.allowed).toHaveLength(1);
      expect(result.allowed[0].action.id).toBe('tagged-1');
    });

    it('should support different sort orders', () => {
      const resultByCost = engine.getAvailableActions(testState, {
        sortBy: 'cost',
        sortDirection: 'asc',
      });
      expect(resultByCost.allowed[0].action.id).toBe('read-data'); // cost 1
      expect(resultByCost.allowed[1].action.id).toBe('delete-data'); // cost 2
      expect(resultByCost.allowed[2].action.id).toBe('write-data'); // cost 5

      const resultByRisk = engine.getAvailableActions(testState, {
        sortBy: 'risk',
        sortDirection: 'desc',
      });
      expect(resultByRisk.allowed[0].action.id).toBe('delete-data'); // risk 0.8
      expect(resultByRisk.allowed[2].action.id).toBe('read-data'); // risk 0.1

      const resultByTime = engine.getAvailableActions(testState, {
        sortBy: 'time',
        sortDirection: 'asc',
      });
      expect(resultByTime.allowed[0].action.id).toBe('read-data'); // time 2
    });

    it('should support limiting results', () => {
      const result = engine.getAvailableActions(testState, {
        limit: 2,
      });

      expect(result.allowed).toHaveLength(2);
    });

    it('should identify recommended action', () => {
      const constraint: SoftConstraint = {
        id: 'cost-opt',
        description: 'Prefer lower cost',
        category: 'cost',
        severity: 'soft',
        score: (state, action) => {
          const actionDef = engine.getAction(action!);
          return 1 - (actionDef?.cost || 0) / 10;
        },
      };

      constraintEngine.addSoftConstraint(constraint);

      const result = engine.getAvailableActions(testState);
      expect(result.recommended).toBeDefined();
      expect(result.recommended!.action.id).toBe('read-data');
    });

    it('should respect minScore threshold for recommendations', () => {
      const constraint: SoftConstraint = {
        id: 'high-bar',
        description: 'High quality bar',
        category: 'custom',
        severity: 'soft',
        score: () => 0.6,
      };

      constraintEngine.addSoftConstraint(constraint);

      const resultLowThreshold = engine.getAvailableActions(testState, {
        minScore: 0.5,
      });
      expect(resultLowThreshold.recommended).toBeDefined();

      const resultHighThreshold = engine.getAvailableActions(testState, {
        minScore: 0.8,
      });
      expect(resultHighThreshold.recommended).toBeUndefined();
    });
  });

  describe('Action Availability Check', () => {
    it('should check specific action availability', () => {
      engine.registerAction({
        id: 'test-action',
        name: 'Test Action',
        description: 'Test',
        preconditions: [
          (state) => {
            const users = Array.from(state.entities.values());
            return users.some(u => u.properties.role === 'admin');
          },
        ],
      });

      const info = engine.isActionAvailable('test-action', testState);
      expect(info).not.toBeNull();
      expect(info!.allowed).toBe(true);

      // Remove admin
      const user = testState.entities.get('user:1');
      if (user) user.properties.role = 'user';

      const infoBlocked = engine.isActionAvailable('test-action', testState);
      expect(infoBlocked).not.toBeNull();
      expect(infoBlocked!.allowed).toBe(false);
    });

    it('should return null for non-existent action', () => {
      const info = engine.isActionAvailable('non-existent', testState);
      expect(info).toBeNull();
    });

    it('should check with custom parameters', () => {
      engine.registerAction({
        id: 'param-action',
        name: 'Parameterized Action',
        description: 'Action with parameters',
      });

      const constraint: HardConstraint = {
        id: 'budget-check',
        description: 'Check budget',
        category: 'policy',
        severity: 'hard',
        predicate: (state, action, params) => {
          if (action !== 'param-action') return true;
          const user = state.entities.get('user:1');
          const budget = user?.properties.budget as number || 0;
          const cost = params?.cost as number || 0;
          return budget >= cost;
        },
      };

      constraintEngine.addHardConstraint(constraint);

      const infoLowCost = engine.isActionAvailable('param-action', testState, { cost: 100 });
      expect(infoLowCost!.allowed).toBe(true);

      const infoHighCost = engine.isActionAvailable('param-action', testState, { cost: 1000 });
      expect(infoHighCost!.allowed).toBe(false);
    });
  });

  describe('Recommended Actions', () => {
    it('should get recommended action', () => {
      engine.registerAction({
        id: 'action-1',
        name: 'Action 1',
        description: 'Low score action',
        cost: 100,
      });

      engine.registerAction({
        id: 'action-2',
        name: 'Action 2',
        description: 'High score action',
        cost: 10,
      });

      const constraint: SoftConstraint = {
        id: 'cost',
        description: 'Minimize cost',
        category: 'cost',
        severity: 'soft',
        score: (state, action) => {
          const actionDef = engine.getAction(action!);
          return 1 - (actionDef?.cost || 0) / 200;
        },
      };

      constraintEngine.addSoftConstraint(constraint);

      const recommended = engine.getRecommendedAction(testState);
      expect(recommended).toBeDefined();
      expect(recommended!.action.id).toBe('action-2');
    });
  });

  describe('Action Blockage Explanation', () => {
    it('should explain why action is blocked', () => {
      engine.registerAction({
        id: 'blocked-action',
        name: 'Blocked Action',
        description: 'This will be blocked',
        preconditions: [
          (state) => {
            const users = Array.from(state.entities.values());
            return users.some(u => u.properties.role === 'admin');
          },
          (state) => {
            const user = state.entities.get('user:1');
            return (user?.properties.budget as number || 0) > 1000;
          },
        ],
      });

      const reasons = engine.explainActionBlockage('blocked-action', testState);
      expect(reasons).toHaveLength(1);
      expect(reasons[0]).toContain('Precondition 2');
    });

    it('should explain constraint violations', () => {
      engine.registerAction({
        id: 'test-action',
        name: 'Test',
        description: 'Test',
      });

      const constraint: HardConstraint = {
        id: 'test-constraint',
        description: 'Test constraint',
        category: 'policy',
        severity: 'hard',
        predicate: () => false,
        violationMessage: 'Always fails',
      };

      constraintEngine.addHardConstraint(constraint);

      const reasons = engine.explainActionBlockage('test-action', testState);
      expect(reasons).toHaveLength(1);
      expect(reasons[0]).toContain('Hard constraint violated');
      expect(reasons[0]).toContain('Test constraint');
    });

    it('should return error for non-existent action', () => {
      const reasons = engine.explainActionBlockage('non-existent', testState);
      expect(reasons).toHaveLength(1);
      expect(reasons[0]).toContain('not found');
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complex planning with multiple constraints', () => {
      // Register actions with different characteristics
      engine.registerAction({
        id: 'expensive-fast',
        name: 'Expensive Fast',
        description: 'High cost, low time',
        cost: 100,
        timeEstimate: 5,
        riskLevel: 0.2,
      });

      engine.registerAction({
        id: 'cheap-slow',
        name: 'Cheap Slow',
        description: 'Low cost, high time',
        cost: 10,
        timeEstimate: 50,
        riskLevel: 0.1,
      });

      engine.registerAction({
        id: 'balanced',
        name: 'Balanced',
        description: 'Medium cost and time',
        cost: 50,
        timeEstimate: 25,
        riskLevel: 0.15,
      });

      // Add constraints
      constraintEngine.addSoftConstraint({
        id: 'cost-opt',
        description: 'Minimize cost',
        category: 'cost',
        severity: 'soft',
        score: (state, action) => {
          const actionDef = engine.getAction(action!);
          return 1 - (actionDef?.cost || 0) / 100;
        },
        weight: 2.0,
      });

      constraintEngine.addSoftConstraint({
        id: 'time-opt',
        description: 'Minimize time',
        category: 'time',
        severity: 'soft',
        score: (state, action) => {
          const actionDef = engine.getAction(action!);
          return 1 - (actionDef?.timeEstimate || 0) / 50;
        },
        weight: 1.0,
      });

      const result = engine.getAvailableActions(testState);
      
      // All should be allowed
      expect(result.allowed).toHaveLength(3);
      expect(result.blocked).toHaveLength(0);

      // Balanced should have best overall score
      const balancedInfo = result.allowed.find(a => a.action.id === 'balanced');
      expect(balancedInfo).toBeDefined();
      expect(balancedInfo!.score).toBeGreaterThan(0.4);
    });
  });
});
