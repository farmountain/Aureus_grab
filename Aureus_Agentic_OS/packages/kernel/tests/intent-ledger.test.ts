import { describe, it, expect, beforeEach } from 'vitest';
import {
  IntentLedger,
  InMemoryIntentStore,
  IntentStatus,
  IntentEventType,
  Intent,
} from '../src/intent-ledger';

describe('IntentLedger', () => {
  let ledger: IntentLedger;
  let store: InMemoryIntentStore;

  beforeEach(() => {
    store = new InMemoryIntentStore();
    ledger = new IntentLedger(store);
  });

  describe('Intent Creation', () => {
    it('should create a new intent with default status', async () => {
      const intent = await ledger.createIntent('user-1', {
        description: 'Complete user onboarding',
        createdBy: 'system',
      });

      expect(intent.id).toBeDefined();
      expect(intent.owner).toBe('user-1');
      expect(intent.currentVersion).toBe(1);
      expect(intent.status).toBe(IntentStatus.DRAFT);
      expect(intent.versions).toHaveLength(1);
      expect(intent.versions[0].description).toBe('Complete user onboarding');
      expect(intent.workflowIds).toHaveLength(0);
      expect(intent.hypothesisIds).toHaveLength(0);
    });

    it('should create intent with custom status', async () => {
      const intent = await ledger.createIntent('user-1', {
        description: 'Process payment',
        createdBy: 'user',
        status: IntentStatus.ACTIVE,
      });

      expect(intent.status).toBe(IntentStatus.ACTIVE);
    });

    it('should create intent with parameters and tags', async () => {
      const intent = await ledger.createIntent('user-1', {
        description: 'Send notification',
        parameters: { email: 'test@example.com', priority: 'high' },
        tags: ['notification', 'email'],
        createdBy: 'system',
      });

      expect(intent.versions[0].parameters).toEqual({
        email: 'test@example.com',
        priority: 'high',
      });
      expect(intent.tags).toEqual(['notification', 'email']);
    });

    it('should emit INTENT_CREATED event', async () => {
      await ledger.createIntent('user-1', {
        description: 'Test intent',
        createdBy: 'system',
      });

      const events = ledger.getAllEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(IntentEventType.INTENT_CREATED);
      expect(events[0].actor).toBe('system');
    });
  });

  describe('Intent Updates and Versioning', () => {
    let intentId: string;

    beforeEach(async () => {
      const intent = await ledger.createIntent('user-1', {
        description: 'Initial description',
        parameters: { value: 1 },
        createdBy: 'system',
      });
      intentId = intent.id;
    });

    it('should update intent and create new version', async () => {
      const updated = await ledger.updateIntent(intentId, {
        description: 'Updated description',
        updatedBy: 'user',
        changeReason: 'Requirements changed',
      });

      expect(updated.currentVersion).toBe(2);
      expect(updated.versions).toHaveLength(2);
      expect(updated.versions[1].description).toBe('Updated description');
      expect(updated.versions[1].changeReason).toBe('Requirements changed');
    });

    it('should merge parameters on update', async () => {
      const updated = await ledger.updateIntent(intentId, {
        parameters: { value: 2, newField: 'test' },
        updatedBy: 'user',
      });

      expect(updated.versions[1].parameters).toEqual({
        value: 2,
        newField: 'test',
      });
    });

    it('should update status', async () => {
      const updated = await ledger.updateIntent(intentId, {
        status: IntentStatus.ACTIVE,
        updatedBy: 'user',
      });

      expect(updated.status).toBe(IntentStatus.ACTIVE);
      expect(updated.versions[1].status).toBe(IntentStatus.ACTIVE);
    });

    it('should emit VERSION_CREATED and INTENT_UPDATED events', async () => {
      await ledger.updateIntent(intentId, {
        description: 'New description',
        updatedBy: 'user',
      });

      const events = ledger.getAuditTrail(intentId);
      expect(events.length).toBeGreaterThanOrEqual(3); // CREATED + VERSION_CREATED + UPDATED
      
      const versionEvent = events.find(e => e.type === IntentEventType.VERSION_CREATED);
      const updateEvent = events.find(e => e.type === IntentEventType.INTENT_UPDATED);
      
      expect(versionEvent).toBeDefined();
      expect(updateEvent).toBeDefined();
    });

    it('should retrieve specific version', async () => {
      await ledger.updateIntent(intentId, {
        description: 'Version 2',
        updatedBy: 'user',
      });

      const version1 = await ledger.getIntentVersion(intentId, 1);
      const version2 = await ledger.getIntentVersion(intentId, 2);

      expect(version1).toBeDefined();
      expect(version1?.description).toBe('Initial description');
      expect(version2).toBeDefined();
      expect(version2?.description).toBe('Version 2');
    });
  });

  describe('Intent Completion and Cancellation', () => {
    let intentId: string;

    beforeEach(async () => {
      const intent = await ledger.createIntent('user-1', {
        description: 'Test intent',
        createdBy: 'system',
        status: IntentStatus.ACTIVE,
      });
      intentId = intent.id;
    });

    it('should complete an intent', async () => {
      const completed = await ledger.completeIntent(intentId, 'system');

      expect(completed.status).toBe(IntentStatus.COMPLETED);
      expect(completed.currentVersion).toBe(2);
    });

    it('should cancel an intent with reason', async () => {
      const cancelled = await ledger.cancelIntent(intentId, 'user', 'No longer needed');

      expect(cancelled.status).toBe(IntentStatus.CANCELLED);
      expect(cancelled.versions[1].changeReason).toBe('No longer needed');
    });
  });

  describe('Workflow Linkage', () => {
    let intentId: string;

    beforeEach(async () => {
      const intent = await ledger.createIntent('user-1', {
        description: 'Test intent',
        createdBy: 'system',
      });
      intentId = intent.id;
    });

    it('should link a workflow to intent', async () => {
      await ledger.linkWorkflow(intentId, 'workflow-1', 'system');

      const intent = await ledger.getIntent(intentId);
      expect(intent?.workflowIds).toContain('workflow-1');
    });

    it('should emit WORKFLOW_LINKED event', async () => {
      await ledger.linkWorkflow(intentId, 'workflow-1', 'system');

      const events = ledger.getAuditTrail(intentId);
      const linkEvent = events.find(e => e.type === IntentEventType.WORKFLOW_LINKED);
      
      expect(linkEvent).toBeDefined();
      expect(linkEvent?.data.workflowId).toBe('workflow-1');
    });

    it('should unlink a workflow from intent', async () => {
      await ledger.linkWorkflow(intentId, 'workflow-1', 'system');
      await ledger.unlinkWorkflow(intentId, 'workflow-1', 'system');

      const intent = await ledger.getIntent(intentId);
      expect(intent?.workflowIds).not.toContain('workflow-1');
    });

    it('should not duplicate workflow links', async () => {
      await ledger.linkWorkflow(intentId, 'workflow-1', 'system');
      await ledger.linkWorkflow(intentId, 'workflow-1', 'system');

      const intent = await ledger.getIntent(intentId);
      expect(intent?.workflowIds.filter(id => id === 'workflow-1')).toHaveLength(1);
    });
  });

  describe('Hypothesis Linkage', () => {
    let intentId: string;

    beforeEach(async () => {
      const intent = await ledger.createIntent('user-1', {
        description: 'Test intent',
        createdBy: 'system',
      });
      intentId = intent.id;
    });

    it('should link a hypothesis to intent', async () => {
      await ledger.linkHypothesis(intentId, 'hypothesis-1', 'system');

      const intent = await ledger.getIntent(intentId);
      expect(intent?.hypothesisIds).toContain('hypothesis-1');
    });

    it('should emit HYPOTHESIS_LINKED event', async () => {
      await ledger.linkHypothesis(intentId, 'hypothesis-1', 'system');

      const events = ledger.getAuditTrail(intentId);
      const linkEvent = events.find(e => e.type === IntentEventType.HYPOTHESIS_LINKED);
      
      expect(linkEvent).toBeDefined();
      expect(linkEvent?.data.hypothesisId).toBe('hypothesis-1');
    });

    it('should unlink a hypothesis from intent', async () => {
      await ledger.linkHypothesis(intentId, 'hypothesis-1', 'system');
      await ledger.unlinkHypothesis(intentId, 'hypothesis-1', 'system');

      const intent = await ledger.getIntent(intentId);
      expect(intent?.hypothesisIds).not.toContain('hypothesis-1');
    });

    it('should not duplicate hypothesis links', async () => {
      await ledger.linkHypothesis(intentId, 'hypothesis-1', 'system');
      await ledger.linkHypothesis(intentId, 'hypothesis-1', 'system');

      const intent = await ledger.getIntent(intentId);
      expect(intent?.hypothesisIds.filter(id => id === 'hypothesis-1')).toHaveLength(1);
    });
  });

  describe('Query Operations', () => {
    beforeEach(async () => {
      // Create multiple intents for testing
      await ledger.createIntent('user-1', {
        description: 'Intent 1',
        createdBy: 'system',
        status: IntentStatus.ACTIVE,
        tags: ['urgent'],
      });

      await ledger.createIntent('user-1', {
        description: 'Intent 2',
        createdBy: 'system',
        status: IntentStatus.DRAFT,
        tags: ['normal'],
      });

      await ledger.createIntent('user-2', {
        description: 'Intent 3',
        createdBy: 'system',
        status: IntentStatus.ACTIVE,
        tags: ['urgent'],
      });
    });

    it('should get intents by owner', async () => {
      const intents = await ledger.getIntentsByOwner('user-1');
      expect(intents).toHaveLength(2);
      expect(intents.every(i => i.owner === 'user-1')).toBe(true);
    });

    it('should get intents by status', async () => {
      const intents = await ledger.getIntentsByStatus(IntentStatus.ACTIVE);
      expect(intents).toHaveLength(2);
      expect(intents.every(i => i.status === IntentStatus.ACTIVE)).toBe(true);
    });

    it('should query intents by tags', async () => {
      const intents = await ledger.queryIntents({ tags: ['urgent'] });
      expect(intents).toHaveLength(2);
    });

    it('should query intents with limit and offset', async () => {
      const page1 = await ledger.queryIntents({ limit: 2, offset: 0 });
      const page2 = await ledger.queryIntents({ limit: 2, offset: 2 });

      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(1);
    });

    it('should query intents by linked workflow', async () => {
      const intent = await ledger.createIntent('user-1', {
        description: 'Intent with workflow',
        createdBy: 'system',
      });
      await ledger.linkWorkflow(intent.id, 'workflow-1', 'system');

      const intents = await ledger.getIntentsByWorkflow('workflow-1');
      expect(intents).toHaveLength(1);
      expect(intents[0].id).toBe(intent.id);
    });

    it('should query intents by linked hypothesis', async () => {
      const intent = await ledger.createIntent('user-1', {
        description: 'Intent with hypothesis',
        createdBy: 'system',
      });
      await ledger.linkHypothesis(intent.id, 'hypothesis-1', 'system');

      const intents = await ledger.getIntentsByHypothesis('hypothesis-1');
      expect(intents).toHaveLength(1);
      expect(intents[0].id).toBe(intent.id);
    });
  });

  describe('Audit Trail', () => {
    it('should track complete audit trail for intent', async () => {
      const intent = await ledger.createIntent('user-1', {
        description: 'Test intent',
        createdBy: 'system',
      });

      await ledger.updateIntent(intent.id, {
        status: IntentStatus.ACTIVE,
        updatedBy: 'user',
      });

      await ledger.linkWorkflow(intent.id, 'workflow-1', 'system');
      await ledger.linkHypothesis(intent.id, 'hypothesis-1', 'system');

      const trail = ledger.getAuditTrail(intent.id);

      expect(trail.length).toBeGreaterThanOrEqual(5);
      expect(trail.map(e => e.type)).toContain(IntentEventType.INTENT_CREATED);
      expect(trail.map(e => e.type)).toContain(IntentEventType.VERSION_CREATED);
      expect(trail.map(e => e.type)).toContain(IntentEventType.INTENT_UPDATED);
      expect(trail.map(e => e.type)).toContain(IntentEventType.WORKFLOW_LINKED);
      expect(trail.map(e => e.type)).toContain(IntentEventType.HYPOTHESIS_LINKED);
    });

    it('should order audit events chronologically', async () => {
      const intent = await ledger.createIntent('user-1', {
        description: 'Test intent',
        createdBy: 'system',
      });

      await ledger.updateIntent(intent.id, {
        description: 'Updated',
        updatedBy: 'user',
      });

      const trail = ledger.getAuditTrail(intent.id);
      
      for (let i = 1; i < trail.length; i++) {
        expect(trail[i].timestamp.getTime()).toBeGreaterThanOrEqual(
          trail[i - 1].timestamp.getTime()
        );
      }
    });
  });

  describe('Error Handling', () => {
    it('should throw error when updating non-existent intent', async () => {
      await expect(
        ledger.updateIntent('non-existent-id', {
          description: 'Test',
          updatedBy: 'user',
        })
      ).rejects.toThrow('Intent non-existent-id not found');
    });

    it('should throw error when linking workflow to non-existent intent', async () => {
      await expect(
        ledger.linkWorkflow('non-existent-id', 'workflow-1', 'system')
      ).rejects.toThrow('Intent non-existent-id not found');
    });

    it('should throw error when linking hypothesis to non-existent intent', async () => {
      await expect(
        ledger.linkHypothesis('non-existent-id', 'hypothesis-1', 'system')
      ).rejects.toThrow('Intent non-existent-id not found');
    });
  });
});

describe('InMemoryIntentStore', () => {
  let store: InMemoryIntentStore;

  beforeEach(() => {
    store = new InMemoryIntentStore();
  });

  it('should save and load intent', async () => {
    const intent: Intent = {
      id: 'test-1',
      owner: 'user-1',
      currentVersion: 1,
      status: IntentStatus.DRAFT,
      versions: [
        {
          version: 1,
          description: 'Test',
          parameters: {},
          status: IntentStatus.DRAFT,
          createdAt: new Date(),
          createdBy: 'system',
        },
      ],
      workflowIds: [],
      hypothesisIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await store.save(intent);
    const loaded = await store.load('test-1');

    expect(loaded).toBeDefined();
    expect(loaded?.id).toBe('test-1');
    expect(loaded?.owner).toBe('user-1');
  });

  it('should return null for non-existent intent', async () => {
    const loaded = await store.load('non-existent');
    expect(loaded).toBeNull();
  });

  it('should list all intents', async () => {
    const intent1: Intent = {
      id: 'test-1',
      owner: 'user-1',
      currentVersion: 1,
      status: IntentStatus.DRAFT,
      versions: [
        {
          version: 1,
          description: 'Test 1',
          parameters: {},
          status: IntentStatus.DRAFT,
          createdAt: new Date(),
          createdBy: 'system',
        },
      ],
      workflowIds: [],
      hypothesisIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const intent2: Intent = {
      id: 'test-2',
      owner: 'user-2',
      currentVersion: 1,
      status: IntentStatus.ACTIVE,
      versions: [
        {
          version: 1,
          description: 'Test 2',
          parameters: {},
          status: IntentStatus.ACTIVE,
          createdAt: new Date(),
          createdBy: 'system',
        },
      ],
      workflowIds: [],
      hypothesisIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await store.save(intent1);
    await store.save(intent2);

    const all = await store.listAll();
    expect(all).toHaveLength(2);
  });
});
