/**
 * Latent State Representation for World Model
 * 
 * This module provides state embedding and prediction capabilities
 * for learning compressed representations of world state and predicting
 * future states based on causal relationships.
 */

import { StateSnapshot, StateDiff } from './state-store';
import { DoGraph, ActionNode, EffectNode } from './do-graph';

/**
 * State embedding - compressed vector representation of world state
 * Embeddings capture semantic relationships and enable efficient similarity comparisons
 */
export interface StateEmbedding {
  /**
   * Unique identifier for this embedding
   */
  id: string;
  
  /**
   * Reference to the source state snapshot
   */
  snapshotId: string;
  
  /**
   * Dense vector representation of the state
   * Dimensionality is determined by the embedding model
   */
  vector: number[];
  
  /**
   * Timestamp when embedding was computed
   */
  timestamp: Date;
  
  /**
   * Metadata about the embedding computation
   */
  metadata?: {
    model?: string;
    dimensions?: number;
    [key: string]: unknown;
  };
}

/**
 * State prediction - forecasted future state based on actions and causal model
 */
export interface StatePrediction {
  /**
   * Unique identifier for this prediction
   */
  id: string;
  
  /**
   * Source state snapshot used as starting point
   */
  sourceSnapshotId: string;
  
  /**
   * Predicted state changes as diffs
   */
  predictedDiffs: StateDiff[];
  
  /**
   * Actions that led to this prediction
   */
  predictedActions: string[]; // action IDs
  
  /**
   * Confidence score for this prediction (0-1)
   */
  confidence: number;
  
  /**
   * Prediction horizon in milliseconds
   */
  horizonMs: number;
  
  /**
   * Timestamp when prediction was made
   */
  timestamp: Date;
  
  /**
   * Optional metadata about the prediction
   */
  metadata?: {
    method?: string;
    causalPaths?: string[];
    [key: string]: unknown;
  };
}

/**
 * Predictive update hook - callback invoked when state changes are predicted or observed
 */
export interface PredictiveUpdateHook {
  /**
   * Unique identifier for this hook
   */
  id: string;
  
  /**
   * Called before a state update is applied
   * Can be used to generate predictions and compare with actual outcomes
   */
  onBeforeUpdate?: (
    snapshot: StateSnapshot,
    predictedDiffs: StateDiff[]
  ) => Promise<void> | void;
  
  /**
   * Called after a state update is applied
   * Can be used to update embeddings and refine prediction models
   */
  onAfterUpdate?: (
    beforeSnapshot: StateSnapshot,
    afterSnapshot: StateSnapshot,
    actualDiffs: StateDiff[]
  ) => Promise<void> | void;
  
  /**
   * Called when a prediction is made
   * Can be used to log or track predictions
   */
  onPrediction?: (
    prediction: StatePrediction
  ) => Promise<void> | void;
}

/**
 * Embedding model interface - computes state embeddings
 */
export interface EmbeddingModel {
  /**
   * Compute embedding for a state snapshot
   */
  embed(snapshot: StateSnapshot): Promise<StateEmbedding>;
  
  /**
   * Compute similarity between two embeddings (0-1, higher is more similar)
   */
  similarity(embedding1: StateEmbedding, embedding2: StateEmbedding): number;
  
  /**
   * Model metadata
   */
  metadata: {
    name: string;
    dimensions: number;
    [key: string]: unknown;
  };
}

/**
 * Prediction model interface - forecasts future states
 */
export interface PredictionModel {
  /**
   * Predict future state changes based on current state and causal graph
   */
  predict(
    currentSnapshot: StateSnapshot,
    doGraph: DoGraph,
    horizonMs: number
  ): Promise<StatePrediction>;
  
  /**
   * Update the model with observed outcomes
   * Used for online learning and model refinement
   */
  learn(
    prediction: StatePrediction,
    actualSnapshot: StateSnapshot,
    actualDiffs: StateDiff[]
  ): Promise<void>;
  
  /**
   * Model metadata
   */
  metadata: {
    name: string;
    [key: string]: unknown;
  };
}

/**
 * Latent State Store - manages embeddings, predictions, and hooks
 */
export class LatentStateStore {
  private embeddings = new Map<string, StateEmbedding>(); // snapshotId -> embedding
  private predictions = new Map<string, StatePrediction[]>(); // snapshotId -> predictions
  private hooks: PredictiveUpdateHook[] = [];
  private embeddingModel?: EmbeddingModel;
  private predictionModel?: PredictionModel;
  
  /**
   * Set the embedding model to use
   */
  setEmbeddingModel(model: EmbeddingModel): void {
    this.embeddingModel = model;
  }
  
  /**
   * Set the prediction model to use
   */
  setPredictionModel(model: PredictionModel): void {
    this.predictionModel = model;
  }
  
  /**
   * Register a predictive update hook
   */
  registerHook(hook: PredictiveUpdateHook): void {
    this.hooks.push(hook);
  }
  
  /**
   * Unregister a hook by ID
   */
  unregisterHook(hookId: string): void {
    this.hooks = this.hooks.filter(h => h.id !== hookId);
  }
  
  /**
   * Compute and store embedding for a snapshot
   */
  async computeEmbedding(snapshot: StateSnapshot): Promise<StateEmbedding> {
    if (!this.embeddingModel) {
      throw new Error('No embedding model configured');
    }
    
    const embedding = await this.embeddingModel.embed(snapshot);
    this.embeddings.set(snapshot.id, embedding);
    return embedding;
  }
  
  /**
   * Get embedding for a snapshot
   */
  getEmbedding(snapshotId: string): StateEmbedding | undefined {
    return this.embeddings.get(snapshotId);
  }
  
  /**
   * Find similar states based on embedding similarity
   */
  findSimilarStates(
    targetSnapshotId: string,
    topK: number = 5,
    minSimilarity: number = 0.7
  ): Array<{ snapshotId: string; similarity: number }> {
    if (!this.embeddingModel) {
      throw new Error('No embedding model configured');
    }
    
    const targetEmbedding = this.embeddings.get(targetSnapshotId);
    if (!targetEmbedding) {
      return [];
    }
    
    const similarities: Array<{ snapshotId: string; similarity: number }> = [];
    
    for (const [snapshotId, embedding] of this.embeddings.entries()) {
      if (snapshotId === targetSnapshotId) continue;
      
      const similarity = this.embeddingModel.similarity(targetEmbedding, embedding);
      if (similarity >= minSimilarity) {
        similarities.push({ snapshotId, similarity });
      }
    }
    
    // Sort by similarity descending and return top K
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }
  
  /**
   * Generate prediction for future state
   */
  async predict(
    currentSnapshot: StateSnapshot,
    doGraph: DoGraph,
    horizonMs: number = 1000
  ): Promise<StatePrediction> {
    if (!this.predictionModel) {
      throw new Error('No prediction model configured');
    }
    
    const prediction = await this.predictionModel.predict(
      currentSnapshot,
      doGraph,
      horizonMs
    );
    
    // Store prediction
    if (!this.predictions.has(currentSnapshot.id)) {
      this.predictions.set(currentSnapshot.id, []);
    }
    this.predictions.get(currentSnapshot.id)!.push(prediction);
    
    // Notify hooks
    await this.notifyPrediction(prediction);
    
    return prediction;
  }
  
  /**
   * Get predictions for a snapshot
   */
  getPredictions(snapshotId: string): StatePrediction[] {
    return this.predictions.get(snapshotId) || [];
  }
  
  /**
   * Notify hooks before state update
   */
  async notifyBeforeUpdate(
    snapshot: StateSnapshot,
    predictedDiffs: StateDiff[]
  ): Promise<void> {
    for (const hook of this.hooks) {
      if (hook.onBeforeUpdate) {
        await hook.onBeforeUpdate(snapshot, predictedDiffs);
      }
    }
  }
  
  /**
   * Notify hooks after state update
   */
  async notifyAfterUpdate(
    beforeSnapshot: StateSnapshot,
    afterSnapshot: StateSnapshot,
    actualDiffs: StateDiff[]
  ): Promise<void> {
    // Compute embedding for new state if model is available
    if (this.embeddingModel) {
      await this.computeEmbedding(afterSnapshot);
    }
    
    // Update prediction model with observed outcome
    if (this.predictionModel) {
      const predictions = this.getPredictions(beforeSnapshot.id);
      for (const prediction of predictions) {
        await this.predictionModel.learn(prediction, afterSnapshot, actualDiffs);
      }
    }
    
    // Notify hooks
    for (const hook of this.hooks) {
      if (hook.onAfterUpdate) {
        await hook.onAfterUpdate(beforeSnapshot, afterSnapshot, actualDiffs);
      }
    }
  }
  
  /**
   * Notify hooks of new prediction
   */
  private async notifyPrediction(prediction: StatePrediction): Promise<void> {
    for (const hook of this.hooks) {
      if (hook.onPrediction) {
        await hook.onPrediction(prediction);
      }
    }
  }
  
  /**
   * Get all embeddings
   */
  getAllEmbeddings(): StateEmbedding[] {
    return Array.from(this.embeddings.values());
  }
  
  /**
   * Get all predictions
   */
  getAllPredictions(): StatePrediction[] {
    const allPredictions: StatePrediction[] = [];
    for (const predictions of this.predictions.values()) {
      allPredictions.push(...predictions);
    }
    return allPredictions;
  }
  
  /**
   * Clear all stored data
   */
  clear(): void {
    this.embeddings.clear();
    this.predictions.clear();
  }
}

/**
 * Simple cosine similarity-based embedding model
 * Uses state entry keys and values to create a basic vector representation
 */
export class SimpleEmbeddingModel implements EmbeddingModel {
  metadata = {
    name: 'simple-embedding',
    dimensions: 128,
  };
  
  async embed(snapshot: StateSnapshot): Promise<StateEmbedding> {
    // Simple hashing-based embedding for demonstration
    // In production, this would use a neural network or other ML model
    const vector = new Array(this.metadata.dimensions).fill(0);
    
    let index = 0;
    for (const [key, entry] of snapshot.entries) {
      // Hash key and value to create vector
      const keyHash = this.hashString(key);
      const valueHash = this.hashString(JSON.stringify(entry.value));
      
      vector[index % this.metadata.dimensions] += keyHash;
      vector[(index + 1) % this.metadata.dimensions] += valueHash;
      index++;
    }
    
    // Normalize vector
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (magnitude > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= magnitude;
      }
    }
    
    return {
      id: `embedding-${snapshot.id}`,
      snapshotId: snapshot.id,
      vector,
      timestamp: new Date(),
      metadata: {
        model: this.metadata.name,
        dimensions: this.metadata.dimensions,
      },
    };
  }
  
  similarity(embedding1: StateEmbedding, embedding2: StateEmbedding): number {
    // Cosine similarity
    if (embedding1.vector.length !== embedding2.vector.length) {
      throw new Error('Embeddings must have same dimensions');
    }
    
    let dotProduct = 0;
    for (let i = 0; i < embedding1.vector.length; i++) {
      dotProduct += embedding1.vector[i] * embedding2.vector[i];
    }
    
    // Vectors are already normalized, so cosine similarity is just dot product
    return Math.max(0, Math.min(1, dotProduct));
  }
  
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }
}

/**
 * Simple causal prediction model based on DoGraph
 * Predicts state changes by analyzing causal patterns in the graph
 */
export class CausalPredictionModel implements PredictionModel {
  metadata = {
    name: 'causal-prediction',
  };
  
  private learningRate = 0.1;
  private confidenceMap = new Map<string, number>(); // action pattern -> confidence
  
  async predict(
    currentSnapshot: StateSnapshot,
    doGraph: DoGraph,
    horizonMs: number
  ): Promise<StatePrediction> {
    // Analyze recent actions and effects in the graph
    const allNodes = doGraph.getAllNodes();
    const actions = allNodes.filter(n => n.type === 'action') as ActionNode[];
    const effects = allNodes.filter(n => n.type === 'effect') as EffectNode[];
    
    // Find recent actions that might trigger in the prediction horizon
    const recentActions = actions
      .filter(a => {
        const age = Date.now() - a.timestamp.getTime();
        return age < horizonMs;
      })
      .slice(-5); // Last 5 actions
    
    // Predict likely effects based on historical patterns
    const predictedDiffs: StateDiff[] = [];
    const predictedActions: string[] = [];
    
    let totalConfidence = 0;
    
    for (const action of recentActions) {
      // Check historical effects of similar actions
      const pattern = action.name;
      const confidence = this.confidenceMap.get(pattern) || 0.5;
      
      // Find effects caused by this action
      const edges = doGraph.getAllEdges();
      const causedEffects = edges
        .filter(e => e.from === action.id && e.type === 'causes')
        .map(e => doGraph.getNode(e.to))
        .filter(n => n && n.type === 'effect') as EffectNode[];
      
      for (const effect of causedEffects) {
        predictedDiffs.push({
          key: effect.stateDiff.key,
          before: {
            key: effect.stateDiff.key,
            value: effect.stateDiff.before,
            version: 1,
            timestamp: effect.timestamp,
          } as any,
          after: {
            key: effect.stateDiff.key,
            value: effect.stateDiff.after,
            version: 2,
            timestamp: new Date(Date.now() + horizonMs),
          } as any,
          operation: 'update',
          timestamp: new Date(Date.now() + horizonMs),
        });
        
        predictedActions.push(action.id);
        totalConfidence += confidence;
      }
    }
    
    // Average confidence
    const avgConfidence = predictedActions.length > 0
      ? totalConfidence / predictedActions.length
      : 0.5;
    
    return {
      id: `prediction-${Date.now()}`,
      sourceSnapshotId: currentSnapshot.id,
      predictedDiffs,
      predictedActions,
      confidence: Math.max(0, Math.min(1, avgConfidence)),
      horizonMs,
      timestamp: new Date(),
      metadata: {
        method: this.metadata.name,
        causalPaths: predictedActions,
      },
    };
  }
  
  async learn(
    prediction: StatePrediction,
    actualSnapshot: StateSnapshot,
    actualDiffs: StateDiff[]
  ): Promise<void> {
    // Compare prediction with actual outcome
    const predictedKeys = new Set(prediction.predictedDiffs.map(d => d.key));
    const actualKeys = new Set(actualDiffs.map(d => d.key));
    
    // Calculate accuracy
    const correctPredictions = Array.from(predictedKeys)
      .filter(k => actualKeys.has(k)).length;
    const totalPredictions = predictedKeys.size;
    
    const accuracy = totalPredictions > 0
      ? correctPredictions / totalPredictions
      : 0;
    
    // Update confidence for action patterns (by action name, not ID)
    // Get unique action names from prediction metadata
    const actionPatterns = new Set<string>();
    if (prediction.metadata?.causalPaths) {
      for (const actionId of prediction.metadata.causalPaths as string[]) {
        // Extract pattern name (this is actually the action ID in current implementation)
        // In production, this would map to action.name from DoGraph
        actionPatterns.add(actionId);
      }
    }
    
    for (const pattern of actionPatterns) {
      const currentConfidence = this.confidenceMap.get(pattern) || 0.5;
      const newConfidence = currentConfidence + this.learningRate * (accuracy - currentConfidence);
      this.confidenceMap.set(pattern, Math.max(0, Math.min(1, newConfidence)));
    }
  }
}
