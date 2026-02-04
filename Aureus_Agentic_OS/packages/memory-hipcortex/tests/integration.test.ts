import { describe, it, expect, beforeEach } from 'vitest';
import {
  PerceptionIntegrator,
  ReflexionIntegrator,
  IntegrationBridge,
  PerceptionOutput,
  ReflexionPostmortem,
} from '../src/integration';
import { SymbolicStore } from '../src/symbolic-store';
import { ProceduralCache } from '../src/procedural-cache';
import { Provenance } from '../src';

describe('Integration', () => {
  describe('PerceptionIntegrator', () => {
    let symbolicStore: SymbolicStore;
    let integrator: PerceptionIntegrator;

    beforeEach(() => {
      symbolicStore = new SymbolicStore();
      integrator = new PerceptionIntegrator(symbolicStore);
    });

    it('should store perception output', async () => {
      const output: PerceptionOutput = {
        entities: [
          {
            id: 'entity-1',
            type: 'person',
            properties: { name: 'Alice' },
            source: 'perception-1',
            confidence: 0.9,
            timestamp: new Date(),
          },
          {
            id: 'entity-2',
            type: 'event',
            properties: { action: 'login' },
            source: 'perception-1',
            confidence: 0.85,
            timestamp: new Date(),
          },
        ],
        inputId: 'input-1',
        timestamp: new Date(),
      };

      await integrator.storePerceptionOutput(output);

      const entity1 = await symbolicStore.get('entity-1');
      const entity2 = await symbolicStore.get('entity-2');

      expect(entity1).toBeDefined();
      expect(entity1?.type).toBe('person');
      expect(entity2).toBeDefined();
      expect(entity2?.type).toBe('event');
    });

    it('should store perception output with provenance', async () => {
      const output: PerceptionOutput = {
        entities: [
          {
            id: 'entity-1',
            type: 'person',
            properties: { name: 'Bob' },
            source: 'perception-1',
            confidence: 0.9,
            timestamp: new Date(),
          },
        ],
        inputId: 'input-1',
        timestamp: new Date(),
      };

      const provenance: Provenance = {
        task_id: 'task-1',
        step_id: 'step-1',
        timestamp: new Date(),
      };

      await integrator.storePerceptionOutput(output, provenance);

      const entity = await symbolicStore.get('entity-1');
      expect(entity).toBeDefined();
    });

    it('should convert perception entity to symbolic entity', () => {
      const perceptionEntity = {
        id: 'entity-1',
        type: 'person',
        properties: { name: 'Alice' },
        relationships: [{ type: 'knows', targetId: 'entity-2' }],
        source: 'perception-1',
        confidence: 0.9,
        timestamp: new Date(),
        metadata: { key: 'value' },
      };

      const symbolicEntity = integrator.convertToSymbolicEntity(perceptionEntity);

      expect(symbolicEntity.id).toBe('entity-1');
      expect(symbolicEntity.type).toBe('person');
      expect(symbolicEntity.properties.name).toBe('Alice');
      expect(symbolicEntity.relationships).toHaveLength(1);
    });

    it('should query for perception compatibility', async () => {
      await symbolicStore.store({
        id: 'entity-1',
        type: 'person',
        properties: { name: 'Alice' },
        source: 'perception-1',
        confidence: 0.9,
        timestamp: new Date(),
      });

      const entities = await integrator.queryForPerception({
        type: 'person',
      });

      expect(entities).toHaveLength(1);
      expect(entities[0].id).toBe('entity-1');
    });
  });

  describe('ReflexionIntegrator', () => {
    let proceduralCache: ProceduralCache;
    let integrator: ReflexionIntegrator;

    beforeEach(() => {
      proceduralCache = new ProceduralCache();
      integrator = new ReflexionIntegrator(proceduralCache);
    });

    it('should store postmortem', async () => {
      const postmortem: ReflexionPostmortem = {
        id: 'pm-1',
        workflowId: 'workflow-1',
        taskId: 'task-1',
        failureTaxonomy: 'timeout-error',
        rootCause: 'Network latency',
        proposedFix: {
          id: 'fix-1',
          fixType: 'parameter-change',
          description: 'Increase timeout',
          changes: { timeout: 30000 },
          confidence: 0.9,
        },
        confidence: 0.85,
        timestamp: new Date(),
      };

      await integrator.storePostmortem(postmortem);

      const entry = await proceduralCache.get('proc-pm-1');
      expect(entry).toBeDefined();
      expect(entry?.type).toBe('fix');
      expect(entry?.context).toBe('timeout-error');
    });

    it('should store postmortem with provenance', async () => {
      const postmortem: ReflexionPostmortem = {
        id: 'pm-2',
        workflowId: 'workflow-1',
        taskId: 'task-1',
        failureTaxonomy: 'validation-error',
        rootCause: 'Invalid input',
        proposedFix: {
          id: 'fix-2',
          fixType: 'tool-swap',
          description: 'Use different validator',
          changes: { tool: 'validator-v2' },
          confidence: 0.88,
        },
        confidence: 0.82,
        timestamp: new Date(),
      };

      const provenance: Provenance = {
        task_id: 'task-1',
        step_id: 'step-1',
        timestamp: new Date(),
      };

      await integrator.storePostmortem(postmortem, provenance);

      const entry = await proceduralCache.get('proc-pm-2');
      expect(entry).toBeDefined();
      expect(entry?.provenance).toBeDefined();
    });

    it('should store successful fix as pattern', async () => {
      await integrator.storeSuccessfulFix(
        'pm-1',
        'fix-1',
        'timeout-error',
        { strategy: 'increase-timeout', value: 30000 }
      );

      const entry = await proceduralCache.get('pattern-fix-1');
      expect(entry).toBeDefined();
      expect(entry?.type).toBe('pattern');
      expect(entry?.confidence).toBe(0.9);
      expect(entry?.successRate).toBe(1.0);
    });

    it('should get relevant fixes', async () => {
      const postmortem: ReflexionPostmortem = {
        id: 'pm-1',
        workflowId: 'workflow-1',
        taskId: 'task-1',
        failureTaxonomy: 'timeout-error',
        rootCause: 'Network latency',
        proposedFix: {
          id: 'fix-1',
          fixType: 'parameter-change',
          description: 'Increase timeout',
          changes: { timeout: 30000 },
          confidence: 0.9,
        },
        confidence: 0.85,
        timestamp: new Date(),
      };

      await integrator.storePostmortem(postmortem);

      const fixes = await integrator.getRelevantFixes('timeout-error');
      expect(fixes).toHaveLength(1);
      expect(fixes[0].context).toBe('timeout-error');
    });

    it('should record fix usage', async () => {
      const postmortem: ReflexionPostmortem = {
        id: 'pm-1',
        workflowId: 'workflow-1',
        taskId: 'task-1',
        failureTaxonomy: 'test-error',
        rootCause: 'Test failure',
        proposedFix: {
          id: 'fix-1',
          fixType: 'parameter-change',
          description: 'Adjust parameters',
          changes: {},
          confidence: 0.9,
        },
        confidence: 0.85,
        timestamp: new Date(),
      };

      await integrator.storePostmortem(postmortem);
      await integrator.recordFixUsage('proc-pm-1', true);

      const entry = await proceduralCache.get('proc-pm-1');
      expect(entry?.usageCount).toBe(1);
      expect(entry?.successRate).toBe(1.0);
    });

    it('should get best fix', async () => {
      // Store multiple fixes
      await integrator.storePostmortem({
        id: 'pm-1',
        workflowId: 'workflow-1',
        taskId: 'task-1',
        failureTaxonomy: 'timeout-error',
        rootCause: 'Test',
        proposedFix: {
          id: 'fix-1',
          fixType: 'parameter-change',
          description: 'Fix 1',
          changes: {},
          confidence: 0.9,
        },
        confidence: 0.85,
        timestamp: new Date(),
      });

      await integrator.storePostmortem({
        id: 'pm-2',
        workflowId: 'workflow-1',
        taskId: 'task-1',
        failureTaxonomy: 'timeout-error',
        rootCause: 'Test',
        proposedFix: {
          id: 'fix-2',
          fixType: 'tool-swap',
          description: 'Fix 2',
          changes: {},
          confidence: 0.95,
        },
        confidence: 0.92,
        timestamp: new Date(),
      });

      const best = await integrator.getBestFix('timeout-error');
      expect(best).toBeDefined();
      expect(best?.context).toBe('timeout-error');
    });
  });

  describe('IntegrationBridge', () => {
    let bridge: IntegrationBridge;
    let symbolicStore: SymbolicStore;
    let proceduralCache: ProceduralCache;

    beforeEach(() => {
      symbolicStore = new SymbolicStore();
      proceduralCache = new ProceduralCache();
      bridge = new IntegrationBridge(symbolicStore, proceduralCache);
    });

    it('should provide access to integrators', () => {
      expect(bridge.perception).toBeInstanceOf(PerceptionIntegrator);
      expect(bridge.reflexion).toBeInstanceOf(ReflexionIntegrator);
    });

    it('should process perception output', async () => {
      const perceptionOutput: PerceptionOutput = {
        entities: [
          {
            id: 'entity-1',
            type: 'person',
            properties: { name: 'Alice' },
            source: 'perception-1',
            confidence: 0.9,
            timestamp: new Date(),
          },
        ],
        inputId: 'input-1',
        timestamp: new Date(),
      };

      await bridge.processAll({ perceptionOutput });

      const entity = await symbolicStore.get('entity-1');
      expect(entity).toBeDefined();
    });

    it('should process postmortem', async () => {
      const postmortem: ReflexionPostmortem = {
        id: 'pm-1',
        workflowId: 'workflow-1',
        taskId: 'task-1',
        failureTaxonomy: 'timeout-error',
        rootCause: 'Network latency',
        proposedFix: {
          id: 'fix-1',
          fixType: 'parameter-change',
          description: 'Increase timeout',
          changes: { timeout: 30000 },
          confidence: 0.9,
        },
        confidence: 0.85,
        timestamp: new Date(),
      };

      await bridge.processAll({ postmortem });

      const entry = await proceduralCache.get('proc-pm-1');
      expect(entry).toBeDefined();
    });

    it('should process both perception and postmortem', async () => {
      const perceptionOutput: PerceptionOutput = {
        entities: [
          {
            id: 'entity-1',
            type: 'person',
            properties: { name: 'Alice' },
            source: 'perception-1',
            confidence: 0.9,
            timestamp: new Date(),
          },
        ],
        inputId: 'input-1',
        timestamp: new Date(),
      };

      const postmortem: ReflexionPostmortem = {
        id: 'pm-1',
        workflowId: 'workflow-1',
        taskId: 'task-1',
        failureTaxonomy: 'timeout-error',
        rootCause: 'Network latency',
        proposedFix: {
          id: 'fix-1',
          fixType: 'parameter-change',
          description: 'Increase timeout',
          changes: { timeout: 30000 },
          confidence: 0.9,
        },
        confidence: 0.85,
        timestamp: new Date(),
      };

      await bridge.processAll({ perceptionOutput, postmortem });

      const entity = await symbolicStore.get('entity-1');
      const entry = await proceduralCache.get('proc-pm-1');

      expect(entity).toBeDefined();
      expect(entry).toBeDefined();
    });

    it('should process with provenance', async () => {
      const provenance: Provenance = {
        task_id: 'task-1',
        step_id: 'step-1',
        timestamp: new Date(),
      };

      const perceptionOutput: PerceptionOutput = {
        entities: [
          {
            id: 'entity-1',
            type: 'person',
            properties: { name: 'Alice' },
            source: 'perception-1',
            confidence: 0.9,
            timestamp: new Date(),
          },
        ],
        inputId: 'input-1',
        timestamp: new Date(),
      };

      await bridge.processAll({ perceptionOutput, provenance });

      const entity = await symbolicStore.get('entity-1');
      expect(entity).toBeDefined();
    });
  });
});
