#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { DoGraph, ActionNode, EffectNode } from './do-graph';

/**
 * Minimal CLI for querying Do-Graph causality
 * Usage: aureus why <effect_id> [--graph-file=path/to/graph.json]
 */

interface SerializedNode {
  id: string;
  type: 'action' | 'effect';
  name?: string;
  toolCall?: string;
  inputs?: Record<string, unknown>;
  description?: string;
  stateDiff?: {
    key: string;
    before: unknown;
    after: unknown;
  };
  timestamp: string;
  metadata?: Record<string, unknown>;
}

interface SerializedEdge {
  id: string;
  from: string;
  to: string;
  type: 'causes' | 'enables';
  timestamp: string;
}

interface SerializedGraph {
  nodes: SerializedNode[];
  edges: SerializedEdge[];
  log: unknown[];
}

function loadGraph(graphFile: string): DoGraph {
  if (!fs.existsSync(graphFile)) {
    console.error(`Error: Graph file not found: ${graphFile}`);
    process.exit(1);
  }

  const data = fs.readFileSync(graphFile, 'utf8');
  let serialized: SerializedGraph;

  try {
    serialized = JSON.parse(data);
  } catch (error) {
    console.error(`Error: Invalid JSON in graph file: ${graphFile}`);
    process.exit(1);
  }

  const graph = new DoGraph();

  // Reconstruct the graph from serialized data
  // Add nodes
  for (const node of serialized.nodes) {
    if (node.type === 'action') {
      const { type, ...actionData } = node;
      if (!actionData.name) {
        console.error(`Error: Action node ${node.id} missing required 'name' field`);
        process.exit(1);
      }
      graph.addAction({
        id: actionData.id,
        name: actionData.name,
        toolCall: actionData.toolCall,
        inputs: actionData.inputs,
        timestamp: new Date(actionData.timestamp),
        metadata: actionData.metadata,
      }, `import-${node.id}`);
    } else if (node.type === 'effect') {
      const { type, ...effectData } = node;
      if (!effectData.description || !effectData.stateDiff) {
        console.error(`Error: Effect node ${node.id} missing required fields`);
        process.exit(1);
      }
      graph.addEffect({
        id: effectData.id,
        description: effectData.description,
        stateDiff: effectData.stateDiff,
        timestamp: new Date(effectData.timestamp),
        metadata: effectData.metadata,
      }, `import-${node.id}`);
    }
  }

  // Add edges
  for (const edge of serialized.edges) {
    if (edge.type === 'causes') {
      graph.linkActionToEffect(edge.from, edge.to, `import-${edge.id}`);
    } else if (edge.type === 'enables') {
      graph.linkEffectToAction(edge.from, edge.to, `import-${edge.id}`);
    }
  }

  return graph;
}

function printCausalChain(result: { effect: EffectNode; actions: ActionNode[]; path: (ActionNode | EffectNode)[] }): void {
  console.log('\n=== Causal Chain Analysis ===\n');
  
  console.log(`Effect: ${result.effect.id}`);
  console.log(`Description: ${result.effect.description}`);
  console.log(`State Diff: ${result.effect.stateDiff.key}`);
  console.log(`  Before: ${JSON.stringify(result.effect.stateDiff.before)}`);
  console.log(`  After:  ${JSON.stringify(result.effect.stateDiff.after)}`);
  console.log();

  if (result.actions.length === 0) {
    console.log('No causal actions found (orphan effect).');
    return;
  }

  console.log(`Caused by ${result.actions.length} action(s):\n`);

  for (let i = 0; i < result.actions.length; i++) {
    const action = result.actions[i];
    console.log(`${i + 1}. ${action.name} (${action.id})`);
    if (action.toolCall) {
      console.log(`   Tool: ${action.toolCall}`);
    }
    if (action.inputs) {
      console.log(`   Inputs: ${JSON.stringify(action.inputs)}`);
    }
    console.log();
  }

  console.log('Full causal path:');
  for (let i = 0; i < result.path.length; i++) {
    const node = result.path[i];
    const prefix = i === 0 ? '  ' : '  → ';
    if (node.type === 'action') {
      console.log(`${prefix}[Action] ${node.name} (${node.id})`);
    } else {
      console.log(`${prefix}[Effect] ${node.description} (${node.id})`);
    }
  }
  console.log();
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: aureus why <effect_id> [--graph-file=path/to/graph.json]');
    console.error('\nQuery the causal chain that led to a specific effect.');
    console.error('\nOptions:');
    console.error('  --graph-file=PATH    Path to graph JSON file (default: ./do-graph.json)');
    console.error('\nExample:');
    console.error('  aureus why effect-1 --graph-file=./my-graph.json');
    process.exit(1);
  }

  const effectId = args[0];
  let graphFile = './do-graph.json';

  // Parse options
  for (const arg of args.slice(1)) {
    if (arg.startsWith('--graph-file=')) {
      graphFile = arg.substring('--graph-file='.length);
    } else if (arg.startsWith('--')) {
      console.error(`Unknown option: ${arg}`);
      process.exit(1);
    }
  }

  graphFile = path.resolve(graphFile);

  console.log(`Loading graph from: ${graphFile}`);
  const graph = loadGraph(graphFile);

  console.log(`Querying: why(${effectId})`);
  const result = graph.why(effectId);

  if (!result) {
    console.error(`\nError: Effect "${effectId}" not found in graph.`);
    console.error('Tip: Effect ID must match an existing effect node, not an action node.');
    process.exit(1);
  }

  printCausalChain(result);
  process.exit(0);
}

main();
