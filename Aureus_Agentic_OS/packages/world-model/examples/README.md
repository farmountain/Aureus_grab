# World Model Examples

This directory contains practical examples demonstrating how to use the world-model package's constraint system, planning engine, and Do-Graph for causal reasoning.

## Running the Examples

You can run the examples using ts-node:

```bash
npx ts-node examples/do-attention-example.ts
```

Or compile and run with Node.js:

```bash
npx tsc examples/*.ts --outDir dist/examples --module commonjs --target ES2020
node dist/examples/do-attention-example.js
```

## Available Examples

### do-attention-example.ts

Demonstrates how to combine Do-Graph's causal reasoning with the constraint system and planning engine to implement Do-Attention - a novel attention mechanism for AI agents.

**What it shows:**
- Setting up a user registration workflow with causal dependencies
- Defining hard constraints (policies, permissions, validation requirements)
- Defining soft constraints (cost, time, risk optimization)
- Querying available actions at each step of the workflow
- How the recommended action changes as state evolves
- Causal analysis using the Do-Graph's `why()` query

**Key concepts:**
- Hard constraints enforce absolute rules (must be satisfied)
- Soft constraints represent optimization preferences (scored 0-1)
- Planning engine combines constraints with state to filter and rank actions
- Do-Graph tracks causal relationships between actions and effects
- Do-Attention = Causal reasoning + Constraint filtering + Preference scoring

**Output:**
The example shows 4 phases of the workflow:
1. Initial state - only validation actions available
2. After email validation - password validation recommended
3. After both validations - user creation becomes available
4. After user creation - welcome email action becomes available

Each phase displays:
- Available actions with their scores (based on cost, time, risk)
- Blocked actions with explanations
- Recommended action (highest scoring, satisfies all constraints)

The final causal analysis shows the complete chain of actions that led to sending the welcome email.

## Understanding Do-Attention

Do-Attention is a novel approach to attention mechanisms in AI agents that combines:

1. **Causal Reasoning**: Use Do-Graph to understand dependencies between actions
2. **Hard Constraints**: Enforce policies, permissions, and data zone restrictions
3. **Soft Constraints**: Optimize for multiple objectives (cost, time, risk)
4. **Dynamic Filtering**: Adapt as state changes and constraints are satisfied

### Traditional Attention vs Do-Attention

**Traditional Attention** (transformers):
- Learned weights over input tokens
- Focuses on "what information is relevant"
- No explicit causal reasoning

**Do-Attention**:
- Causal graph + constraint filtering
- Focuses on "what actions are available and optimal"
- Explicitly models causality, permissions, and optimization

### Benefits

✓ **Safe**: Never violates critical constraints
✓ **Optimal**: Balances multiple objectives simultaneously
✓ **Explainable**: Clear reasoning for recommendations
✓ **Adaptive**: Updates dynamically as state changes
✓ **Causal**: Understands dependencies between actions

## Creating Your Own Examples

To create a new example:

1. Import the necessary types from `../src/index`:
```typescript
import {
  DoGraph,
  WorldState,
  ConstraintEngine,
  PlanningEngine,
  HardConstraint,
  SoftConstraint,
  ActionDefinition,
} from '../src/index';
```

2. Set up your world state with entities and relationships

3. Define your hard constraints (policies, permissions, requirements)

4. Define your soft constraints (optimization preferences)

5. Register your actions with the planning engine

6. Query available actions and get recommendations

7. Use Do-Graph to track causal relationships

See the existing examples for detailed patterns.

## Further Reading

- [CONSTRAINTS_AND_PLANNING.md](../CONSTRAINTS_AND_PLANNING.md) - Comprehensive documentation
- [README.md](../README.md) - Package overview and usage
- [tests/](../tests/) - Unit tests with more examples
