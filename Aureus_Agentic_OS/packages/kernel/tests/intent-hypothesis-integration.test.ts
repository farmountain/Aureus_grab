import { describe, it, expect, beforeEach } from 'vitest';
import {
  IntentLedger,
  InMemoryIntentStore,
  IntentStatus,
  IntentEventType,
} from '../src/intent-ledger';
import { HypothesisManager } from '@aureus/hypothesis';

describe('Intent-Hypothesis Integration', () => {
  let intentLedger: IntentLedger;
  let hypothesisManager: HypothesisManager;

  beforeEach(() => {
    const intentStore = new InMemoryIntentStore();
    intentLedger = new IntentLedger(intentStore);

    hypothesisManager = new HypothesisManager({
      maxConcurrentHypotheses: 5,
      scoringCriteria: {
        confidenceWeight: 0.3,
        costWeight: 0.2,
        riskWeight: 0.3,
        goalAlignmentWeight: 0.2,
      },
      minAcceptableScore: 0.6,
      autoPrune: false,
      enableTelemetry: false,
    });
  });

  it('should link hypothesis to intent version', async () => {
    // Create an intent
    const intent = await intentLedger.createIntent('user-1', {
      description: 'Optimize database query performance',
      createdBy: 'system',
      status: IntentStatus.ACTIVE,
    });

    // Register a goal for the hypothesis
    hypothesisManager.registerGoal({
      id: 'goal-1',
      description: 'Improve query response time',
      successCriteria: [],
    });

    // Create a hypothesis linked to the intent
    const hypothesis = await hypothesisManager.createHypothesis(
      'goal-1',
      'Add index on frequently queried columns',
      [
        {
          id: 'action-1',
          type: 'database_migration',
          parameters: { table: 'users', columns: ['email', 'created_at'] },
        },
      ],
      {
        intentId: intent.id,
        intentVersion: intent.currentVersion,
      }
    );

    // Verify linkage
    expect(hypothesis.intentId).toBe(intent.id);
    expect(hypothesis.intentVersion).toBe(1);

    // Link hypothesis to intent
    await intentLedger.linkHypothesis(intent.id, hypothesis.id, 'system');

    // Verify bidirectional linkage
    const updatedIntent = await intentLedger.getIntent(intent.id);
    expect(updatedIntent?.hypothesisIds).toContain(hypothesis.id);
  });

  it('should track multiple hypotheses for different intent versions', async () => {
    // Create an intent
    const intent = await intentLedger.createIntent('user-1', {
      description: 'Reduce API latency',
      createdBy: 'system',
      status: IntentStatus.ACTIVE,
    });

    // Register a goal
    hypothesisManager.registerGoal({
      id: 'goal-1',
      description: 'Optimize API performance',
      successCriteria: [],
    });

    // Create first hypothesis for version 1
    const hypothesis1 = await hypothesisManager.createHypothesis(
      'goal-1',
      'Add caching layer',
      [
        {
          id: 'action-1',
          type: 'add_cache',
          parameters: { type: 'redis' },
        },
      ],
      {
        intentId: intent.id,
        intentVersion: intent.currentVersion,
      }
    );

    await intentLedger.linkHypothesis(intent.id, hypothesis1.id, 'system');

    // Update intent to version 2
    const updatedIntent = await intentLedger.updateIntent(intent.id, {
      description: 'Reduce API latency (updated requirements)',
      parameters: { targetLatency: '100ms' },
      updatedBy: 'user',
      changeReason: 'Stricter latency requirements',
    });

    // Create second hypothesis for version 2
    const hypothesis2 = await hypothesisManager.createHypothesis(
      'goal-1',
      'Optimize database queries and add caching',
      [
        {
          id: 'action-1',
          type: 'optimize_queries',
          parameters: {},
        },
        {
          id: 'action-2',
          type: 'add_cache',
          parameters: { type: 'redis' },
        },
      ],
      {
        intentId: updatedIntent.id,
        intentVersion: updatedIntent.currentVersion,
      }
    );

    await intentLedger.linkHypothesis(updatedIntent.id, hypothesis2.id, 'system');

    // Verify both hypotheses are linked to intent
    const finalIntent = await intentLedger.getIntent(intent.id);
    expect(finalIntent?.hypothesisIds).toContain(hypothesis1.id);
    expect(finalIntent?.hypothesisIds).toContain(hypothesis2.id);
    expect(finalIntent?.currentVersion).toBe(2);

    // Verify hypotheses have correct version linkage
    expect(hypothesis1.intentVersion).toBe(1);
    expect(hypothesis2.intentVersion).toBe(2);
  });

  it('should query hypotheses by intent', async () => {
    // Create intent
    const intent = await intentLedger.createIntent('user-1', {
      description: 'Implement user authentication',
      createdBy: 'system',
      status: IntentStatus.ACTIVE,
    });

    // Register goal
    hypothesisManager.registerGoal({
      id: 'goal-1',
      description: 'Secure user access',
      successCriteria: [],
    });

    // Create multiple hypotheses
    const hyp1 = await hypothesisManager.createHypothesis(
      'goal-1',
      'Use OAuth 2.0',
      [],
      { intentId: intent.id, intentVersion: 1 }
    );

    const hyp2 = await hypothesisManager.createHypothesis(
      'goal-1',
      'Use JWT tokens',
      [],
      { intentId: intent.id, intentVersion: 1 }
    );

    await intentLedger.linkHypothesis(intent.id, hyp1.id, 'system');
    await intentLedger.linkHypothesis(intent.id, hyp2.id, 'system');

    // Query intents by hypothesis
    const intents1 = await intentLedger.getIntentsByHypothesis(hyp1.id);
    const intents2 = await intentLedger.getIntentsByHypothesis(hyp2.id);

    expect(intents1).toHaveLength(1);
    expect(intents1[0].id).toBe(intent.id);
    expect(intents2).toHaveLength(1);
    expect(intents2[0].id).toBe(intent.id);
  });

  it('should maintain audit trail for intent-hypothesis relationships', async () => {
    // Create intent
    const intent = await intentLedger.createIntent('user-1', {
      description: 'Scale infrastructure',
      createdBy: 'system',
    });

    // Register goal
    hypothesisManager.registerGoal({
      id: 'goal-1',
      description: 'Handle increased load',
      successCriteria: [],
    });

    // Create hypothesis
    const hypothesis = await hypothesisManager.createHypothesis(
      'goal-1',
      'Add auto-scaling',
      [],
      { intentId: intent.id, intentVersion: 1 }
    );

    // Link and unlink to test audit trail
    await intentLedger.linkHypothesis(intent.id, hypothesis.id, 'system');
    await intentLedger.unlinkHypothesis(intent.id, hypothesis.id, 'admin');
    await intentLedger.linkHypothesis(intent.id, hypothesis.id, 'system');

    // Check audit trail
    const trail = intentLedger.getAuditTrail(intent.id);
    
    const linkEvents = trail.filter(e => e.type === IntentEventType.HYPOTHESIS_LINKED);
    const unlinkEvents = trail.filter(e => e.type === IntentEventType.HYPOTHESIS_UNLINKED);

    expect(linkEvents).toHaveLength(2);
    expect(unlinkEvents).toHaveLength(1);
  });

  it('should support workflow and hypothesis linkage on same intent', async () => {
    // Create intent
    const intent = await intentLedger.createIntent('user-1', {
      description: 'Deploy new feature',
      createdBy: 'system',
      status: IntentStatus.ACTIVE,
    });

    // Register goal
    hypothesisManager.registerGoal({
      id: 'goal-1',
      description: 'Safe feature deployment',
      successCriteria: [],
    });

    // Create hypothesis
    const hypothesis = await hypothesisManager.createHypothesis(
      'goal-1',
      'Use canary deployment',
      [
        {
          id: 'action-1',
          type: 'deploy',
          parameters: { strategy: 'canary' },
        },
      ],
      { intentId: intent.id, intentVersion: 1 }
    );

    // Link hypothesis
    await intentLedger.linkHypothesis(intent.id, hypothesis.id, 'system');

    // Link workflow (simulated)
    await intentLedger.linkWorkflow(intent.id, 'workflow-1', 'system');

    // Verify both linkages exist
    const updatedIntent = await intentLedger.getIntent(intent.id);
    expect(updatedIntent?.hypothesisIds).toContain(hypothesis.id);
    expect(updatedIntent?.workflowIds).toContain('workflow-1');
  });
});
