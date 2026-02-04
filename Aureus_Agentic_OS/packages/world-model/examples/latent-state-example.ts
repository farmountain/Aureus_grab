/**
 * Integration Example: Latent State Representation with DoGraph
 * 
 * This example demonstrates how to use the latent state system
 * with DoGraph for causal reasoning and predictive updates.
 */

import {
  InMemoryStateStore,
  DoGraph,
  LatentStateStore,
  SimpleEmbeddingModel,
  CausalPredictionModel,
} from '../src/index';

async function main() {
  console.log('=== Latent State Representation Example ===\n');

  // Initialize stores and models
  const stateStore = new InMemoryStateStore();
  const doGraph = new DoGraph();
  const latentStore = new LatentStateStore();

  // Configure models
  const embeddingModel = new SimpleEmbeddingModel();
  const predictionModel = new CausalPredictionModel();
  
  latentStore.setEmbeddingModel(embeddingModel);
  latentStore.setPredictionModel(predictionModel);

  // Register predictive update hooks
  latentStore.registerHook({
    id: 'example-hook',
    onPrediction: async (prediction) => {
      console.log(`📊 Prediction made:`);
      console.log(`   Confidence: ${prediction.confidence.toFixed(2)}`);
      console.log(`   Predicted changes: ${prediction.predictedDiffs.length}`);
      console.log(`   Horizon: ${prediction.horizonMs}ms\n`);
    },
    onAfterUpdate: async (before, after, diffs) => {
      console.log(`✅ State updated:`);
      console.log(`   Actual changes: ${diffs.length}`);
      console.log(`   Snapshot: ${before.id} -> ${after.id}\n`);
    },
  });

  // Connect stores for automatic hook invocation
  stateStore.setLatentStateStore(latentStore);

  // === Step 1: Create initial state ===
  console.log('Step 1: Creating initial state...');
  await stateStore.create('user:1', { 
    name: 'Alice', 
    age: 30, 
    email: 'alice@example.com' 
  });
  
  const snapshot1 = await stateStore.snapshot();
  console.log(`Snapshot created: ${snapshot1.id}\n`);

  // === Step 2: Compute embedding ===
  console.log('Step 2: Computing state embedding...');
  const embedding1 = await latentStore.computeEmbedding(snapshot1);
  console.log(`Embedding computed:`);
  console.log(`   Dimensions: ${embedding1.vector.length}`);
  console.log(`   Vector magnitude: ${Math.sqrt(embedding1.vector.reduce((s, v) => s + v * v, 0)).toFixed(3)}\n`);

  // === Step 3: Add actions and effects to DoGraph ===
  console.log('Step 3: Recording action in DoGraph...');
  const action1 = doGraph.addAction({
    id: 'action-1',
    name: 'update-user-age',
    toolCall: 'database.update',
    inputs: { userId: '1', age: 31 },
    timestamp: new Date(),
  }, 'event-1');

  const effect1 = doGraph.addEffect({
    id: 'effect-1',
    description: 'User age updated',
    stateDiff: {
      key: 'user:1',
      before: { age: 30 },
      after: { age: 31 },
    },
    timestamp: new Date(),
  }, 'event-2');

  doGraph.linkActionToEffect(action1.id, effect1.id, 'event-3');
  console.log(`Action recorded: ${action1.name}\n`);

  // === Step 4: Generate prediction ===
  console.log('Step 4: Generating state prediction...');
  const prediction = await latentStore.predict(snapshot1, doGraph, 1000);
  // Hook will log prediction details

  // === Step 5: Apply actual update ===
  console.log('Step 5: Applying state update...');
  await stateStore.update('user:1', { 
    name: 'Alice', 
    age: 31, 
    email: 'alice@example.com' 
  }, 1);
  // Hook will log update details

  const snapshot2 = await stateStore.snapshot();
  const embedding2 = await latentStore.computeEmbedding(snapshot2);

  // === Step 6: Check embedding similarity ===
  console.log('Step 6: Comparing state embeddings...');
  const similarity = embeddingModel.similarity(embedding1, embedding2);
  console.log(`Similarity: ${similarity.toFixed(3)}\n`);

  // === Step 7: Create more states and find similar ones ===
  console.log('Step 7: Creating additional states...');
  await stateStore.create('user:2', { 
    name: 'Bob', 
    age: 30, 
    email: 'bob@example.com' 
  });
  const snapshot3 = await stateStore.snapshot();
  await latentStore.computeEmbedding(snapshot3);

  await stateStore.create('user:3', { 
    name: 'Charlie', 
    age: 45, 
    email: 'charlie@example.com' 
  });
  const snapshot4 = await stateStore.snapshot();
  await latentStore.computeEmbedding(snapshot4);

  console.log('Finding similar states to snapshot 1...');
  const similarStates = latentStore.findSimilarStates(snapshot1.id, 3, 0.5);
  console.log(`Found ${similarStates.length} similar states:`);
  for (const result of similarStates) {
    console.log(`   ${result.snapshotId}: similarity ${result.similarity.toFixed(3)}`);
  }
  console.log();

  // === Step 8: Query causal chain ===
  console.log('Step 8: Querying causal chain...');
  const causalChain = doGraph.why('effect-1');
  if (causalChain) {
    console.log(`Causal chain for effect-1:`);
    console.log(`   Actions: ${causalChain.actions.length}`);
    console.log(`   Path length: ${causalChain.path.length}`);
    for (const node of causalChain.path) {
      console.log(`   - [${node.type}] ${node.type === 'action' ? node.name : node.description}`);
    }
  }
  console.log();

  // === Step 9: Summary ===
  console.log('=== Summary ===');
  console.log(`Total embeddings: ${latentStore.getAllEmbeddings().length}`);
  console.log(`Total predictions: ${latentStore.getAllPredictions().length}`);
  console.log(`DoGraph nodes: ${doGraph.getAllNodes().length}`);
  console.log(`DoGraph edges: ${doGraph.getAllEdges().length}`);
  console.log('\n✨ Example completed successfully!');
}

// Run the example
main().catch(console.error);
