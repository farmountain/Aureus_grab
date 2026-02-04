import { describe, it, expect, beforeEach } from 'vitest';
import { DoGraph, ActionNode, EffectNode } from '../src/do-graph';

describe('DoGraph', () => {
  let graph: DoGraph;

  beforeEach(() => {
    graph = new DoGraph();
  });

  describe('Node Management', () => {
    it('should add an action node', () => {
      const action = graph.addAction(
        {
          id: 'action-1',
          name: 'create-user',
          toolCall: 'database.create',
          inputs: { name: 'Alice' },
          timestamp: new Date(),
        },
        'event-1'
      );

      expect(action.id).toBe('action-1');
      expect(action.type).toBe('action');
      expect(action.name).toBe('create-user');
      expect(action.toolCall).toBe('database.create');
    });

    it('should add an effect node', () => {
      const effect = graph.addEffect(
        {
          id: 'effect-1',
          description: 'User created in database',
          stateDiff: {
            key: 'user:1',
            before: null,
            after: { name: 'Alice', id: 1 },
          },
          timestamp: new Date(),
        },
        'event-2'
      );

      expect(effect.id).toBe('effect-1');
      expect(effect.type).toBe('effect');
      expect(effect.description).toBe('User created in database');
      expect(effect.stateDiff.key).toBe('user:1');
    });

    it('should retrieve nodes by id', () => {
      graph.addAction(
        {
          id: 'action-1',
          name: 'test-action',
          timestamp: new Date(),
        },
        'event-1'
      );

      const node = graph.getNode('action-1');
      expect(node).toBeDefined();
      expect(node!.id).toBe('action-1');
      expect(node!.type).toBe('action');
    });

    it('should return undefined for non-existent nodes', () => {
      const node = graph.getNode('non-existent');
      expect(node).toBeUndefined();
    });

    it('should get all nodes', () => {
      graph.addAction(
        { id: 'action-1', name: 'action1', timestamp: new Date() },
        'event-1'
      );
      graph.addEffect(
        {
          id: 'effect-1',
          description: 'effect1',
          stateDiff: { key: 'k1', before: null, after: 'v1' },
          timestamp: new Date(),
        },
        'event-2'
      );

      const nodes = graph.getAllNodes();
      expect(nodes).toHaveLength(2);
      expect(nodes.map(n => n.id)).toContain('action-1');
      expect(nodes.map(n => n.id)).toContain('effect-1');
    });
  });

  describe('Edge Management', () => {
    beforeEach(() => {
      graph.addAction(
        { id: 'action-1', name: 'action1', timestamp: new Date() },
        'event-1'
      );
      graph.addEffect(
        {
          id: 'effect-1',
          description: 'effect1',
          stateDiff: { key: 'k1', before: null, after: 'v1' },
          timestamp: new Date(),
        },
        'event-2'
      );
    });

    it('should link action to effect with "causes" edge', () => {
      const edge = graph.linkActionToEffect('action-1', 'effect-1', 'event-3');

      expect(edge.from).toBe('action-1');
      expect(edge.to).toBe('effect-1');
      expect(edge.type).toBe('causes');
    });

    it('should link effect to action with "enables" edge', () => {
      graph.addAction(
        { id: 'action-2', name: 'action2', timestamp: new Date() },
        'event-3'
      );

      const edge = graph.linkEffectToAction('effect-1', 'action-2', 'event-4');

      expect(edge.from).toBe('effect-1');
      expect(edge.to).toBe('action-2');
      expect(edge.type).toBe('enables');
    });

    it('should throw error when linking non-existent source node', () => {
      expect(() => {
        graph.linkActionToEffect('non-existent', 'effect-1', 'event-3');
      }).toThrow('Source node non-existent not found');
    });

    it('should throw error when linking non-existent target node', () => {
      expect(() => {
        graph.linkActionToEffect('action-1', 'non-existent', 'event-3');
      }).toThrow('Target node non-existent not found');
    });

    it('should get all edges', () => {
      graph.addAction(
        { id: 'action-2', name: 'action2', timestamp: new Date() },
        'event-3'
      );
      graph.linkActionToEffect('action-1', 'effect-1', 'event-4');
      graph.linkEffectToAction('effect-1', 'action-2', 'event-5');

      const edges = graph.getAllEdges();
      expect(edges).toHaveLength(2);
      expect(edges[0].type).toBe('causes');
      expect(edges[1].type).toBe('enables');
    });
  });

  describe('Append-Only Log', () => {
    it('should record node additions in log', () => {
      graph.addAction(
        { id: 'action-1', name: 'action1', timestamp: new Date() },
        'event-1'
      );
      graph.addEffect(
        {
          id: 'effect-1',
          description: 'effect1',
          stateDiff: { key: 'k1', before: null, after: 'v1' },
          timestamp: new Date(),
        },
        'event-2'
      );

      const log = graph.getLog();
      expect(log).toHaveLength(2);
      expect(log[0].operation).toBe('add_node');
      expect(log[0].eventId).toBe('event-1');
      expect(log[0].node!.id).toBe('action-1');
      expect(log[1].operation).toBe('add_node');
      expect(log[1].eventId).toBe('event-2');
      expect(log[1].node!.id).toBe('effect-1');
    });

    it('should record edge additions in log', () => {
      graph.addAction(
        { id: 'action-1', name: 'action1', timestamp: new Date() },
        'event-1'
      );
      graph.addEffect(
        {
          id: 'effect-1',
          description: 'effect1',
          stateDiff: { key: 'k1', before: null, after: 'v1' },
          timestamp: new Date(),
        },
        'event-2'
      );
      graph.linkActionToEffect('action-1', 'effect-1', 'event-3');

      const log = graph.getLog();
      expect(log).toHaveLength(3);
      expect(log[2].operation).toBe('add_edge');
      expect(log[2].eventId).toBe('event-3');
      expect(log[2].edge!.from).toBe('action-1');
      expect(log[2].edge!.to).toBe('effect-1');
    });

    it('should maintain immutable log', () => {
      graph.addAction(
        { id: 'action-1', name: 'action1', timestamp: new Date() },
        'event-1'
      );

      const log1 = graph.getLog();
      const log1Length = log1.length;

      graph.addEffect(
        {
          id: 'effect-1',
          description: 'effect1',
          stateDiff: { key: 'k1', before: null, after: 'v1' },
          timestamp: new Date(),
        },
        'event-2'
      );

      const log2 = graph.getLog();

      // Original log should not be modified
      expect(log1.length).toBe(log1Length);
      expect(log2.length).toBe(log1Length + 1);
    });
  });

  describe('why() Query', () => {
    it('should return null for non-existent effect', () => {
      const result = graph.why('non-existent');
      expect(result).toBeNull();
    });

    it('should return null for action node', () => {
      graph.addAction(
        { id: 'action-1', name: 'action1', timestamp: new Date() },
        'event-1'
      );

      const result = graph.why('action-1');
      expect(result).toBeNull();
    });

    it('should return single action cause for direct effect', () => {
      graph.addAction(
        {
          id: 'action-1',
          name: 'create-user',
          toolCall: 'db.create',
          timestamp: new Date(),
        },
        'event-1'
      );
      graph.addEffect(
        {
          id: 'effect-1',
          description: 'User created',
          stateDiff: { key: 'user:1', before: null, after: { name: 'Alice' } },
          timestamp: new Date(),
        },
        'event-2'
      );
      graph.linkActionToEffect('action-1', 'effect-1', 'event-3');

      const result = graph.why('effect-1');

      expect(result).not.toBeNull();
      expect(result!.effect.id).toBe('effect-1');
      expect(result!.actions).toHaveLength(1);
      expect(result!.actions[0].id).toBe('action-1');
      expect(result!.path).toHaveLength(2);
      expect(result!.path[0].id).toBe('action-1');
      expect(result!.path[1].id).toBe('effect-1');
    });

    it('should trace multi-level causality', () => {
      // Action 1 causes Effect 1
      graph.addAction(
        { id: 'action-1', name: 'action1', timestamp: new Date() },
        'event-1'
      );
      graph.addEffect(
        {
          id: 'effect-1',
          description: 'effect1',
          stateDiff: { key: 'k1', before: null, after: 'v1' },
          timestamp: new Date(),
        },
        'event-2'
      );
      graph.linkActionToEffect('action-1', 'effect-1', 'event-3');

      // Effect 1 enables Action 2
      graph.addAction(
        { id: 'action-2', name: 'action2', timestamp: new Date() },
        'event-4'
      );
      graph.linkEffectToAction('effect-1', 'action-2', 'event-5');

      // Action 2 causes Effect 2
      graph.addEffect(
        {
          id: 'effect-2',
          description: 'effect2',
          stateDiff: { key: 'k2', before: null, after: 'v2' },
          timestamp: new Date(),
        },
        'event-6'
      );
      graph.linkActionToEffect('action-2', 'effect-2', 'event-7');

      const result = graph.why('effect-2');

      expect(result).not.toBeNull();
      expect(result!.effect.id).toBe('effect-2');
      expect(result!.actions).toHaveLength(2);
      expect(result!.actions[0].id).toBe('action-1');
      expect(result!.actions[1].id).toBe('action-2');
      expect(result!.path).toHaveLength(4);
      expect(result!.path.map(n => n.id)).toEqual([
        'action-1',
        'effect-1',
        'action-2',
        'effect-2',
      ]);
    });

    it('should handle effect with no causes', () => {
      graph.addEffect(
        {
          id: 'effect-1',
          description: 'orphan effect',
          stateDiff: { key: 'k1', before: null, after: 'v1' },
          timestamp: new Date(),
        },
        'event-1'
      );

      const result = graph.why('effect-1');

      expect(result).not.toBeNull();
      expect(result!.effect.id).toBe('effect-1');
      expect(result!.actions).toHaveLength(0);
      expect(result!.path).toHaveLength(1);
    });
  });

  describe('whatIf() Query', () => {
    it('should return null for non-existent action', () => {
      const result = graph.whatIf('non-existent');
      expect(result).toBeNull();
    });

    it('should return null for effect node', () => {
      graph.addEffect(
        {
          id: 'effect-1',
          description: 'effect1',
          stateDiff: { key: 'k1', before: null, after: 'v1' },
          timestamp: new Date(),
        },
        'event-1'
      );

      const result = graph.whatIf('effect-1');
      expect(result).toBeNull();
    });

    it('should identify direct effects of an action', () => {
      graph.addAction(
        { id: 'action-1', name: 'action1', timestamp: new Date() },
        'event-1'
      );
      graph.addEffect(
        {
          id: 'effect-1',
          description: 'effect1',
          stateDiff: { key: 'k1', before: null, after: 'v1' },
          timestamp: new Date(),
        },
        'event-2'
      );
      graph.linkActionToEffect('action-1', 'effect-1', 'event-3');

      const result = graph.whatIf('action-1');

      expect(result).not.toBeNull();
      expect(result!.removedAction.id).toBe('action-1');
      expect(result!.directEffects).toHaveLength(1);
      expect(result!.directEffects[0].id).toBe('effect-1');
      expect(result!.indirectEffects).toHaveLength(0);
      expect(result!.impactedActions).toHaveLength(0);
    });

    it('should estimate cascading impacts', () => {
      // Action 1 causes Effect 1
      graph.addAction(
        { id: 'action-1', name: 'action1', timestamp: new Date() },
        'event-1'
      );
      graph.addEffect(
        {
          id: 'effect-1',
          description: 'effect1',
          stateDiff: { key: 'k1', before: null, after: 'v1' },
          timestamp: new Date(),
        },
        'event-2'
      );
      graph.linkActionToEffect('action-1', 'effect-1', 'event-3');

      // Effect 1 enables Action 2
      graph.addAction(
        { id: 'action-2', name: 'action2', timestamp: new Date() },
        'event-4'
      );
      graph.linkEffectToAction('effect-1', 'action-2', 'event-5');

      // Action 2 causes Effect 2
      graph.addEffect(
        {
          id: 'effect-2',
          description: 'effect2',
          stateDiff: { key: 'k2', before: null, after: 'v2' },
          timestamp: new Date(),
        },
        'event-6'
      );
      graph.linkActionToEffect('action-2', 'effect-2', 'event-7');

      const result = graph.whatIf('action-1');

      expect(result).not.toBeNull();
      expect(result!.removedAction.id).toBe('action-1');
      expect(result!.directEffects).toHaveLength(1);
      expect(result!.directEffects[0].id).toBe('effect-1');
      expect(result!.impactedActions).toHaveLength(1);
      expect(result!.impactedActions[0].id).toBe('action-2');
      expect(result!.indirectEffects).toHaveLength(1);
      expect(result!.indirectEffects[0].id).toBe('effect-2');
    });

    it('should handle action with no effects', () => {
      graph.addAction(
        { id: 'action-1', name: 'no-op', timestamp: new Date() },
        'event-1'
      );

      const result = graph.whatIf('action-1');

      expect(result).not.toBeNull();
      expect(result!.removedAction.id).toBe('action-1');
      expect(result!.directEffects).toHaveLength(0);
      expect(result!.indirectEffects).toHaveLength(0);
      expect(result!.impactedActions).toHaveLength(0);
    });

    it('should handle complex dependency chains', () => {
      // Setup: action-1 -> effect-1 -> action-2 -> effect-2
      //                              -> action-3 -> effect-3
      graph.addAction(
        { id: 'action-1', name: 'action1', timestamp: new Date() },
        'event-1'
      );
      graph.addEffect(
        {
          id: 'effect-1',
          description: 'effect1',
          stateDiff: { key: 'k1', before: null, after: 'v1' },
          timestamp: new Date(),
        },
        'event-2'
      );
      graph.linkActionToEffect('action-1', 'effect-1', 'event-3');

      // Branch 1
      graph.addAction(
        { id: 'action-2', name: 'action2', timestamp: new Date() },
        'event-4'
      );
      graph.linkEffectToAction('effect-1', 'action-2', 'event-5');
      graph.addEffect(
        {
          id: 'effect-2',
          description: 'effect2',
          stateDiff: { key: 'k2', before: null, after: 'v2' },
          timestamp: new Date(),
        },
        'event-6'
      );
      graph.linkActionToEffect('action-2', 'effect-2', 'event-7');

      // Branch 2
      graph.addAction(
        { id: 'action-3', name: 'action3', timestamp: new Date() },
        'event-8'
      );
      graph.linkEffectToAction('effect-1', 'action-3', 'event-9');
      graph.addEffect(
        {
          id: 'effect-3',
          description: 'effect3',
          stateDiff: { key: 'k3', before: null, after: 'v3' },
          timestamp: new Date(),
        },
        'event-10'
      );
      graph.linkActionToEffect('action-3', 'effect-3', 'event-11');

      const result = graph.whatIf('action-1');

      expect(result).not.toBeNull();
      expect(result!.directEffects).toHaveLength(1);
      expect(result!.directEffects[0].id).toBe('effect-1');
      expect(result!.impactedActions).toHaveLength(2);
      expect(result!.impactedActions.map(a => a.id).sort()).toEqual([
        'action-2',
        'action-3',
      ]);
      expect(result!.indirectEffects).toHaveLength(2);
      expect(result!.indirectEffects.map(e => e.id).sort()).toEqual([
        'effect-2',
        'effect-3',
      ]);
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle a realistic workflow scenario', () => {
      // Scenario: User registration workflow
      // 1. validate-email action -> email-valid effect
      // 2. email-valid effect enables create-user action
      // 3. create-user action -> user-created effect
      // 4. user-created effect enables send-welcome action
      // 5. send-welcome action -> email-sent effect

      const validateEmail = graph.addAction(
        {
          id: 'validate-email',
          name: 'Validate Email',
          toolCall: 'email.validate',
          inputs: { email: 'alice@example.com' },
          timestamp: new Date(),
        },
        'event-1'
      );

      const emailValid = graph.addEffect(
        {
          id: 'email-valid',
          description: 'Email validated successfully',
          stateDiff: {
            key: 'validation:email',
            before: null,
            after: { valid: true },
          },
          timestamp: new Date(),
        },
        'event-2'
      );

      graph.linkActionToEffect('validate-email', 'email-valid', 'event-3');

      const createUser = graph.addAction(
        {
          id: 'create-user',
          name: 'Create User',
          toolCall: 'database.create',
          inputs: { email: 'alice@example.com', name: 'Alice' },
          timestamp: new Date(),
        },
        'event-4'
      );

      graph.linkEffectToAction('email-valid', 'create-user', 'event-5');

      const userCreated = graph.addEffect(
        {
          id: 'user-created',
          description: 'User created in database',
          stateDiff: {
            key: 'user:1',
            before: null,
            after: { id: 1, email: 'alice@example.com', name: 'Alice' },
          },
          timestamp: new Date(),
        },
        'event-6'
      );

      graph.linkActionToEffect('create-user', 'user-created', 'event-7');

      const sendWelcome = graph.addAction(
        {
          id: 'send-welcome',
          name: 'Send Welcome Email',
          toolCall: 'email.send',
          inputs: { to: 'alice@example.com', template: 'welcome' },
          timestamp: new Date(),
        },
        'event-8'
      );

      graph.linkEffectToAction('user-created', 'send-welcome', 'event-9');

      const emailSent = graph.addEffect(
        {
          id: 'email-sent',
          description: 'Welcome email sent',
          stateDiff: {
            key: 'email:welcome:1',
            before: null,
            after: { sent: true, timestamp: new Date() },
          },
          timestamp: new Date(),
        },
        'event-10'
      );

      graph.linkActionToEffect('send-welcome', 'email-sent', 'event-11');

      // Query: Why was email sent?
      const whyResult = graph.why('email-sent');
      expect(whyResult).not.toBeNull();
      expect(whyResult!.actions).toHaveLength(3);
      expect(whyResult!.actions.map(a => a.id)).toEqual([
        'validate-email',
        'create-user',
        'send-welcome',
      ]);

      // Query: What if we remove email validation?
      const whatIfResult = graph.whatIf('validate-email');
      expect(whatIfResult).not.toBeNull();
      expect(whatIfResult!.directEffects).toHaveLength(1);
      expect(whatIfResult!.directEffects[0].id).toBe('email-valid');
      expect(whatIfResult!.impactedActions).toHaveLength(2);
      expect(whatIfResult!.indirectEffects).toHaveLength(2);
    });
  });
});
