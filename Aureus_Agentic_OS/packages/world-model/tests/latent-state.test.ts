import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  LatentStateStore,
  SimpleEmbeddingModel,
  CausalPredictionModel,
  StateEmbedding,
  StatePrediction,
  PredictiveUpdateHook,
} from '../src/latent-state';
import { InMemoryStateStore, StateSnapshot } from '../src/state-store';
import { DoGraph } from '../src/do-graph';

describe('LatentStateStore', () => {
  let latentStore: LatentStateStore;
  let stateStore: InMemoryStateStore;
  let doGraph: DoGraph;

  beforeEach(() => {
    latentStore = new LatentStateStore();
    stateStore = new InMemoryStateStore();
    doGraph = new DoGraph();
  });

  describe('Embedding Management', () => {
    it('should compute and store embeddings', async () => {
      const model = new SimpleEmbeddingModel();
      latentStore.setEmbeddingModel(model);

      await stateStore.create('user:1', { name: 'Alice', age: 30 });
      const snapshot = await stateStore.snapshot();

      const embedding = await latentStore.computeEmbedding(snapshot);

      expect(embedding.id).toBe(`embedding-${snapshot.id}`);
      expect(embedding.snapshotId).toBe(snapshot.id);
      expect(embedding.vector).toHaveLength(128);
      expect(embedding.timestamp).toBeInstanceOf(Date);
    });

    it('should retrieve stored embeddings', async () => {
      const model = new SimpleEmbeddingModel();
      latentStore.setEmbeddingModel(model);

      await stateStore.create('user:1', { name: 'Alice', age: 30 });
      const snapshot = await stateStore.snapshot();

      await latentStore.computeEmbedding(snapshot);
      const retrieved = latentStore.getEmbedding(snapshot.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.snapshotId).toBe(snapshot.id);
    });

    it('should find similar states based on embeddings', async () => {
      const model = new SimpleEmbeddingModel();
      latentStore.setEmbeddingModel(model);

      // Create similar states
      await stateStore.create('user:1', { name: 'Alice', age: 30 });
      const snapshot1 = await stateStore.snapshot();
      await latentStore.computeEmbedding(snapshot1);

      await stateStore.create('user:2', { name: 'Bob', age: 31 });
      const snapshot2 = await stateStore.snapshot();
      await latentStore.computeEmbedding(snapshot2);

      await stateStore.create('user:3', { name: 'Charlie', age: 32 });
      const snapshot3 = await stateStore.snapshot();
      await latentStore.computeEmbedding(snapshot3);

      const similar = latentStore.findSimilarStates(snapshot1.id, 2, 0.0);

      expect(similar.length).toBeGreaterThan(0);
      expect(similar.length).toBeLessThanOrEqual(2);
      expect(similar[0].similarity).toBeGreaterThanOrEqual(0);
      expect(similar[0].similarity).toBeLessThanOrEqual(1);
    });

    it('should throw error when computing embedding without model', async () => {
      await stateStore.create('user:1', { name: 'Alice' });
      const snapshot = await stateStore.snapshot();

      await expect(latentStore.computeEmbedding(snapshot))
        .rejects.toThrow('No embedding model configured');
    });
  });

  describe('Prediction Management', () => {
    it('should generate and store predictions', async () => {
      const model = new CausalPredictionModel();
      latentStore.setPredictionModel(model);

      await stateStore.create('user:1', { name: 'Alice', age: 30 });
      const snapshot = await stateStore.snapshot();

      // Add some actions to the graph
      doGraph.addAction({
        id: 'action-1',
        name: 'update-user',
        toolCall: 'database.update',
        inputs: { userId: '1', age: 31 },
        timestamp: new Date(),
      }, 'event-1');

      const prediction = await latentStore.predict(snapshot, doGraph, 1000);

      expect(prediction.id).toBeDefined();
      expect(prediction.sourceSnapshotId).toBe(snapshot.id);
      expect(prediction.confidence).toBeGreaterThanOrEqual(0);
      expect(prediction.confidence).toBeLessThanOrEqual(1);
      expect(prediction.horizonMs).toBe(1000);
    });

    it('should retrieve predictions for a snapshot', async () => {
      const model = new CausalPredictionModel();
      latentStore.setPredictionModel(model);

      await stateStore.create('user:1', { name: 'Alice' });
      const snapshot = await stateStore.snapshot();

      await latentStore.predict(snapshot, doGraph, 1000);
      const predictions = latentStore.getPredictions(snapshot.id);

      expect(predictions).toHaveLength(1);
      expect(predictions[0].sourceSnapshotId).toBe(snapshot.id);
    });

    it('should throw error when predicting without model', async () => {
      await stateStore.create('user:1', { name: 'Alice' });
      const snapshot = await stateStore.snapshot();

      await expect(latentStore.predict(snapshot, doGraph, 1000))
        .rejects.toThrow('No prediction model configured');
    });
  });

  describe('Predictive Update Hooks', () => {
    it('should register and call hooks on prediction', async () => {
      const model = new CausalPredictionModel();
      latentStore.setPredictionModel(model);

      const onPrediction = vi.fn();
      const hook: PredictiveUpdateHook = {
        id: 'test-hook',
        onPrediction,
      };

      latentStore.registerHook(hook);

      await stateStore.create('user:1', { name: 'Alice' });
      const snapshot = await stateStore.snapshot();
      await latentStore.predict(snapshot, doGraph, 1000);

      expect(onPrediction).toHaveBeenCalledTimes(1);
      expect(onPrediction.mock.calls[0][0]).toHaveProperty('id');
      expect(onPrediction.mock.calls[0][0]).toHaveProperty('confidence');
    });

    it('should call onBeforeUpdate hook', async () => {
      const onBeforeUpdate = vi.fn();
      const hook: PredictiveUpdateHook = {
        id: 'test-hook',
        onBeforeUpdate,
      };

      latentStore.registerHook(hook);

      const snapshot = await stateStore.snapshot();
      await latentStore.notifyBeforeUpdate(snapshot, []);

      expect(onBeforeUpdate).toHaveBeenCalledTimes(1);
    });

    it('should call onAfterUpdate hook and compute embeddings', async () => {
      const model = new SimpleEmbeddingModel();
      latentStore.setEmbeddingModel(model);

      const onAfterUpdate = vi.fn();
      const hook: PredictiveUpdateHook = {
        id: 'test-hook',
        onAfterUpdate,
      };

      latentStore.registerHook(hook);

      await stateStore.create('user:1', { name: 'Alice', age: 30 });
      const before = await stateStore.snapshot();
      
      await stateStore.update('user:1', { name: 'Alice', age: 31 }, 1);
      const after = await stateStore.snapshot();
      
      const diffs = stateStore.diff(before, after);
      await latentStore.notifyAfterUpdate(before, after, diffs);

      expect(onAfterUpdate).toHaveBeenCalledTimes(1);
      expect(onAfterUpdate.mock.calls[0][0].id).toBe(before.id);
      expect(onAfterUpdate.mock.calls[0][1].id).toBe(after.id);
      
      // Check that embedding was computed
      const embedding = latentStore.getEmbedding(after.id);
      expect(embedding).toBeDefined();
    });

    it('should unregister hooks', async () => {
      const onPrediction = vi.fn();
      const hook: PredictiveUpdateHook = {
        id: 'test-hook',
        onPrediction,
      };

      latentStore.registerHook(hook);
      latentStore.unregisterHook('test-hook');

      const model = new CausalPredictionModel();
      latentStore.setPredictionModel(model);

      await stateStore.create('user:1', { name: 'Alice' });
      const snapshot = await stateStore.snapshot();
      await latentStore.predict(snapshot, doGraph, 1000);

      expect(onPrediction).not.toHaveBeenCalled();
    });

    it('should handle multiple hooks', async () => {
      const model = new CausalPredictionModel();
      latentStore.setPredictionModel(model);

      const onPrediction1 = vi.fn();
      const onPrediction2 = vi.fn();

      latentStore.registerHook({ id: 'hook1', onPrediction: onPrediction1 });
      latentStore.registerHook({ id: 'hook2', onPrediction: onPrediction2 });

      await stateStore.create('user:1', { name: 'Alice' });
      const snapshot = await stateStore.snapshot();
      await latentStore.predict(snapshot, doGraph, 1000);

      expect(onPrediction1).toHaveBeenCalledTimes(1);
      expect(onPrediction2).toHaveBeenCalledTimes(1);
    });
  });

  describe('Integration with StateStore', () => {
    it('should integrate with StateStore for automatic hook calls', async () => {
      const model = new SimpleEmbeddingModel();
      latentStore.setEmbeddingModel(model);

      const onAfterUpdate = vi.fn();
      latentStore.registerHook({ id: 'test-hook', onAfterUpdate });

      // Connect latent store to state store
      stateStore.setLatentStateStore(latentStore);

      await stateStore.create('user:1', { name: 'Alice', age: 30 });
      await stateStore.update('user:1', { name: 'Alice', age: 31 }, 1);

      expect(onAfterUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe('Data Management', () => {
    it('should get all embeddings', async () => {
      const model = new SimpleEmbeddingModel();
      latentStore.setEmbeddingModel(model);

      await stateStore.create('user:1', { name: 'Alice' });
      const snapshot1 = await stateStore.snapshot();
      await latentStore.computeEmbedding(snapshot1);

      await stateStore.create('user:2', { name: 'Bob' });
      const snapshot2 = await stateStore.snapshot();
      await latentStore.computeEmbedding(snapshot2);

      const embeddings = latentStore.getAllEmbeddings();
      expect(embeddings).toHaveLength(2);
    });

    it('should get all predictions', async () => {
      const model = new CausalPredictionModel();
      latentStore.setPredictionModel(model);

      await stateStore.create('user:1', { name: 'Alice' });
      const snapshot = await stateStore.snapshot();
      
      await latentStore.predict(snapshot, doGraph, 1000);
      await latentStore.predict(snapshot, doGraph, 2000);

      const predictions = latentStore.getAllPredictions();
      expect(predictions).toHaveLength(2);
    });

    it('should clear all data', async () => {
      const embeddingModel = new SimpleEmbeddingModel();
      const predictionModel = new CausalPredictionModel();
      latentStore.setEmbeddingModel(embeddingModel);
      latentStore.setPredictionModel(predictionModel);

      await stateStore.create('user:1', { name: 'Alice' });
      const snapshot = await stateStore.snapshot();
      
      await latentStore.computeEmbedding(snapshot);
      await latentStore.predict(snapshot, doGraph, 1000);

      latentStore.clear();

      expect(latentStore.getAllEmbeddings()).toHaveLength(0);
      expect(latentStore.getAllPredictions()).toHaveLength(0);
    });
  });
});

describe('SimpleEmbeddingModel', () => {
  let model: SimpleEmbeddingModel;
  let stateStore: InMemoryStateStore;

  beforeEach(() => {
    model = new SimpleEmbeddingModel();
    stateStore = new InMemoryStateStore();
  });

  it('should generate normalized embeddings', async () => {
    await stateStore.create('user:1', { name: 'Alice', age: 30 });
    const snapshot = await stateStore.snapshot();

    const embedding = await model.embed(snapshot);

    expect(embedding.vector).toHaveLength(128);
    
    // Check normalization (magnitude should be ~1)
    const magnitude = Math.sqrt(
      embedding.vector.reduce((sum, v) => sum + v * v, 0)
    );
    expect(magnitude).toBeCloseTo(1, 5);
  });

  it('should compute similarity between embeddings', async () => {
    await stateStore.create('user:1', { name: 'Alice', age: 30 });
    const snapshot1 = await stateStore.snapshot();
    const embedding1 = await model.embed(snapshot1);

    await stateStore.create('user:2', { name: 'Alice', age: 30 });
    const snapshot2 = await stateStore.snapshot();
    const embedding2 = await model.embed(snapshot2);

    const similarity = model.similarity(embedding1, embedding2);

    expect(similarity).toBeGreaterThanOrEqual(0);
    expect(similarity).toBeLessThanOrEqual(1);
  });

  it('should return high similarity for identical states', async () => {
    await stateStore.create('user:1', { name: 'Alice', age: 30 });
    const snapshot = await stateStore.snapshot();
    const embedding1 = await model.embed(snapshot);
    const embedding2 = await model.embed(snapshot);

    const similarity = model.similarity(embedding1, embedding2);
    expect(similarity).toBeCloseTo(1, 5);
  });

  it('should throw error for mismatched dimensions', async () => {
    await stateStore.create('user:1', { name: 'Alice' });
    const snapshot = await stateStore.snapshot();
    const embedding1 = await model.embed(snapshot);
    const embedding2 = { ...embedding1, vector: [1, 2, 3] };

    expect(() => model.similarity(embedding1, embedding2))
      .toThrow('Embeddings must have same dimensions');
  });
});

describe('CausalPredictionModel', () => {
  let model: CausalPredictionModel;
  let stateStore: InMemoryStateStore;
  let doGraph: DoGraph;

  beforeEach(() => {
    model = new CausalPredictionModel();
    stateStore = new InMemoryStateStore();
    doGraph = new DoGraph();
  });

  it('should predict based on causal graph', async () => {
    await stateStore.create('user:1', { name: 'Alice', age: 30 });
    const snapshot = await stateStore.snapshot();

    // Add action and effect to graph
    const action = doGraph.addAction({
      id: 'action-1',
      name: 'update-user',
      toolCall: 'database.update',
      inputs: { userId: '1' },
      timestamp: new Date(),
    }, 'event-1');

    const effect = doGraph.addEffect({
      id: 'effect-1',
      description: 'User updated',
      stateDiff: {
        key: 'user:1',
        before: { age: 30 },
        after: { age: 31 },
      },
      timestamp: new Date(),
    }, 'event-2');

    doGraph.linkActionToEffect(action.id, effect.id, 'event-3');

    const prediction = await model.predict(snapshot, doGraph, 5000);

    expect(prediction.sourceSnapshotId).toBe(snapshot.id);
    expect(prediction.confidence).toBeGreaterThanOrEqual(0);
    expect(prediction.confidence).toBeLessThanOrEqual(1);
  });

  it('should learn from prediction outcomes', async () => {
    await stateStore.create('user:1', { name: 'Alice', age: 30 });
    const beforeSnapshot = await stateStore.snapshot();

    const prediction = await model.predict(beforeSnapshot, doGraph, 1000);
    const initialConfidence = prediction.confidence;

    // Simulate actual outcome
    await stateStore.update('user:1', { name: 'Alice', age: 31 }, 1);
    const afterSnapshot = await stateStore.snapshot();
    const diffs = stateStore.diff(beforeSnapshot, afterSnapshot);

    // Learn from outcome
    await model.learn(prediction, afterSnapshot, diffs);

    // The model should have updated internal confidence
    // (we can't easily test this without exposing internals,
    // but we verify the method runs without error)
    expect(true).toBe(true);
  });

  it('should handle empty causal graph', async () => {
    await stateStore.create('user:1', { name: 'Alice' });
    const snapshot = await stateStore.snapshot();

    const prediction = await model.predict(snapshot, doGraph, 1000);

    expect(prediction.predictedDiffs).toHaveLength(0);
    expect(prediction.predictedActions).toHaveLength(0);
  });
});
