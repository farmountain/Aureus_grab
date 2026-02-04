# Constraints and Planning System

## Overview

The world-model package now includes a comprehensive constraint system and planning hooks that enable external agents and planners to query available actions based on the current state and constraints.

## Constraint System

For regulated workflows, use the domain constraint packs layer described in [DOMAIN_CONSTRAINTS.md](./DOMAIN_CONSTRAINTS.md), which adds versioned packs, audit hooks, CRV validation, and approval governance.

### Constraint Types

The system supports two types of constraints:

1. **Hard Constraints** (`severity: 'hard'`): Must never be violated. These represent absolute rules like policy requirements, permissions, and data zone restrictions.

2. **Soft Constraints** (`severity: 'soft'`): Preferences to optimize. These represent optimization goals like minimizing cost, time, or risk.

### Constraint Categories

Constraints can be categorized for organization:

- `policy`: Policy and permission constraints
- `data_zone`: Data zone and access restrictions
- `security`: Security-related constraints
- `cost`: Cost optimization preferences
- `time`: Time optimization preferences
- `risk`: Risk minimization preferences
- `custom`: Custom constraints

### Using the Constraint Engine

```typescript
import { ConstraintEngine, HardConstraint, SoftConstraint } from '@aureus/world-model';

const engine = new ConstraintEngine();

// Add a hard constraint (must be satisfied)
const policyConstraint: HardConstraint = {
  id: 'admin-only-delete',
  description: 'Only administrators can delete resources',
  category: 'policy',
  severity: 'hard',
  predicate: (state, action, params) => {
    if (action !== 'delete-resource') return true;
    const users = Array.from(state.entities.values());
    return users.some(u => u.properties.role === 'admin');
  },
  violationMessage: 'User does not have admin privileges',
};

engine.addHardConstraint(policyConstraint);

// Add a soft constraint (preference to optimize)
const costConstraint: SoftConstraint = {
  id: 'minimize-cost',
  description: 'Prefer actions with lower cost',
  category: 'cost',
  severity: 'soft',
  score: (state, action, params) => {
    const cost = params?.cost as number || 0;
    // Returns score between 0 and 1 (higher is better)
    return Math.max(0, 1 - cost / 1000);
  },
  weight: 2.0, // Higher weight = more important
  minScore: 0.3, // Optional: minimum acceptable score
};

engine.addSoftConstraint(costConstraint);

// Validate constraints
const result = engine.validate(currentState, 'delete-resource', { cost: 100 });

if (!result.satisfied) {
  console.log('Violations:', result.violations);
}

console.log('Overall score:', result.score); // Weighted score from soft constraints
```

### Hard Constraints

Hard constraints represent absolute rules that must never be violated. They are evaluated using a predicate function that returns `true` if the constraint is satisfied.

**Example: Data Zone Restriction**

```typescript
const dataZoneConstraint: HardConstraint = {
  id: 'us-only-data',
  description: 'Data must stay within US zones',
  category: 'data_zone',
  severity: 'hard',
  predicate: (state, action, params) => {
    if (action !== 'move-data') return true;
    const targetZone = params?.zone as string;
    return targetZone?.startsWith('us-');
  },
  violationMessage: 'Cannot move data outside US zones',
};
```

**Example: Permission Check**

```typescript
const writePermission: HardConstraint = {
  id: 'write-permission',
  description: 'User must have write permission',
  category: 'policy',
  severity: 'hard',
  predicate: (state, action, params) => {
    if (!action?.includes('write')) return true;
    const user = state.entities.get('current-user');
    const permissions = user?.properties.permissions as string[] || [];
    return permissions.includes('write');
  },
};
```

### Soft Constraints

Soft constraints represent preferences that should be optimized. They use a score function that returns a value between 0 and 1, where higher scores indicate better satisfaction.

**Example: Cost Optimization**

```typescript
const costOptimization: SoftConstraint = {
  id: 'cost-efficiency',
  description: 'Minimize operational costs',
  category: 'cost',
  severity: 'soft',
  score: (state, action, params) => {
    const cost = params?.cost as number || 0;
    const budget = 1000;
    // Score decreases linearly with cost
    return Math.max(0, 1 - cost / budget);
  },
  weight: 2.0, // Cost is twice as important as default weight of 1.0
};
```

**Example: Time Optimization**

```typescript
const timeOptimization: SoftConstraint = {
  id: 'time-efficiency',
  description: 'Minimize execution time',
  category: 'time',
  severity: 'soft',
  score: (state, action, params) => {
    const timeEstimate = params?.timeEstimate as number || 0;
    const maxTime = 3600; // 1 hour
    return Math.max(0, 1 - timeEstimate / maxTime);
  },
  weight: 1.0,
};
```

**Example: Risk Minimization**

```typescript
const riskMinimization: SoftConstraint = {
  id: 'risk-control',
  description: 'Minimize operational risk',
  category: 'risk',
  severity: 'soft',
  score: (state, action, params) => {
    const riskLevel = params?.riskLevel as number || 0; // 0-1 scale
    return 1 - riskLevel;
  },
  weight: 1.5,
  minScore: 0.7, // Reject actions with risk > 0.3
};
```

### Weighted Multi-Objective Optimization

When multiple soft constraints are present, the system computes a weighted average score:

```typescript
// Overall score = (score1 * weight1 + score2 * weight2 + ...) / (weight1 + weight2 + ...)

// Example with 3 constraints:
// - Cost: score 0.8, weight 2.0 -> contribution 1.6
// - Time: score 0.6, weight 1.0 -> contribution 0.6
// - Risk: score 0.9, weight 1.5 -> contribution 1.35
// Overall: (1.6 + 0.6 + 1.35) / (2.0 + 1.0 + 1.5) = 3.55 / 4.5 = 0.79
```

## Planning Engine

The Planning Engine provides APIs for querying available actions based on current state and constraints.

### Basic Usage

```typescript
import { PlanningEngine, ActionDefinition } from '@aureus/world-model';

const planner = new PlanningEngine(constraintEngine);

// Register actions
const createUserAction: ActionDefinition = {
  id: 'create-user',
  name: 'Create User',
  description: 'Create a new user account',
  parameters: {
    username: { name: 'username', type: 'string', required: true },
    email: { name: 'email', type: 'string', required: true },
  },
  cost: 10,
  timeEstimate: 5,
  riskLevel: 0.2,
  preconditions: [
    (state) => {
      // Check if admin is logged in
      const admin = state.entities.get('current-user');
      return admin?.properties.role === 'admin';
    },
  ],
};

planner.registerAction(createUserAction);

// Query available actions
const result = planner.getAvailableActions(currentState);

console.log('Allowed actions:', result.allowed);
console.log('Blocked actions:', result.blocked);
console.log('Recommended action:', result.recommended);
```

### Querying Available Actions

The `getAvailableActions` method returns:

- **allowed**: Actions that satisfy all hard constraints and preconditions
- **blocked**: Actions blocked by constraints or preconditions
- **recommended**: The highest-scoring allowed action

```typescript
const result = planner.getAvailableActions(state, {
  category: 'data-operations',  // Filter by category
  tags: ['safe', 'audited'],    // Filter by tags
  minScore: 0.7,                // Minimum score for recommendations
  limit: 5,                     // Max number of results
  sortBy: 'score',              // Sort by: 'score' | 'cost' | 'time' | 'risk'
  sortDirection: 'desc',        // 'asc' | 'desc'
});

for (const actionInfo of result.allowed) {
  console.log(`${actionInfo.action.name}: score ${actionInfo.score.toFixed(2)}`);
  
  if (!actionInfo.allowed) {
    console.log('  Violations:', actionInfo.validation.violations);
  }
}

if (result.recommended) {
  console.log('Recommended:', result.recommended.action.name);
}
```

### Checking Specific Actions

```typescript
// Check if a specific action is available
const actionInfo = planner.isActionAvailable(
  'create-user',
  currentState,
  { username: 'alice', email: 'alice@example.com' }
);

if (actionInfo) {
  console.log('Allowed:', actionInfo.allowed);
  console.log('Score:', actionInfo.score);
}

// Explain why an action is blocked
const reasons = planner.explainActionBlockage('delete-user', currentState);
for (const reason of reasons) {
  console.log('- ', reason);
}
// Output:
// - Precondition 1 not satisfied
// - Hard constraint violated: Only admins can delete users (User does not have admin privileges)
```

### Advanced Action Definitions

```typescript
const complexAction: ActionDefinition = {
  id: 'transfer-funds',
  name: 'Transfer Funds',
  description: 'Transfer money between accounts',
  
  parameters: {
    from: {
      name: 'from',
      type: 'string',
      required: true,
      description: 'Source account ID',
    },
    to: {
      name: 'to',
      type: 'string',
      required: true,
      description: 'Destination account ID',
    },
    amount: {
      name: 'amount',
      type: 'number',
      required: true,
      description: 'Amount to transfer',
    },
  },
  
  preconditions: [
    // Check source account has sufficient balance
    (state) => {
      const account = state.entities.get('account:1');
      return (account?.properties.balance as number || 0) >= 100;
    },
    // Check user has transfer permission
    (state) => {
      const user = state.entities.get('current-user');
      const permissions = user?.properties.permissions as string[] || [];
      return permissions.includes('transfer');
    },
  ],
  
  effects: [
    {
      entityId: 'account:1',
      property: 'balance',
      value: 'computed', // Actual value computed at execution time
    },
  ],
  
  cost: 1.5,        // Transaction fee
  timeEstimate: 10, // Seconds
  riskLevel: 0.3,   // Medium risk
  
  metadata: {
    category: 'financial',
    tags: ['transaction', 'audited'],
    requiresApproval: true,
  },
};
```

## Integration with Do-Graph and Do-Attention

### How Constraints Enable Do-Attention

The constraint system enables a novel approach to attention mechanisms in AI agents, which we call **Do-Attention**. This mechanism combines causal reasoning (from Do-Graph) with constraint-based filtering to focus agent attention on the most relevant and permissible actions.

#### Traditional Attention vs Do-Attention

**Traditional Attention** (in transformers):
- Learned weights over input tokens
- Focuses on "what information is relevant"
- No explicit causal or constraint reasoning

**Do-Attention**:
- Causal graph + constraint filtering
- Focuses on "what actions are available and optimal"
- Explicitly models causality, permissions, and optimization

#### How It Works

1. **Causal Filtering**: Use Do-Graph to identify actions that could lead to desired effects
   ```typescript
   // Query: What actions could create a user?
   const relevantActions = doGraph.findActionsWithEffect('user-created');
   ```

2. **Constraint Filtering**: Apply hard constraints to eliminate forbidden actions
   ```typescript
   const allowedActions = relevantActions.filter(action => 
     constraintEngine.isActionAllowed(currentState, action.id)
   );
   ```

3. **Preference Scoring**: Use soft constraints to rank remaining actions
   ```typescript
   const scoredActions = allowedActions.map(action => ({
     action,
     score: constraintEngine.getActionScore(currentState, action.id),
   })).sort((a, b) => b.score - a.score);
   ```

4. **Attention Distribution**: Compute attention weights proportional to scores
   ```typescript
   const totalScore = scoredActions.reduce((sum, a) => sum + a.score, 0);
   const attentionWeights = scoredActions.map(a => ({
     action: a.action,
     weight: a.score / totalScore,
   }));
   ```

### Example: Planning with Do-Attention

```typescript
import { DoGraph, ConstraintEngine, PlanningEngine } from '@aureus/world-model';

// Step 1: Build causal model
const doGraph = new DoGraph();

// Add action nodes and their effects
const validateAction = doGraph.addAction({
  id: 'validate-email',
  name: 'Validate Email',
  toolCall: 'email.validate',
  inputs: { email: 'user@example.com' },
  timestamp: new Date(),
}, 'event-1');

const validEffect = doGraph.addEffect({
  id: 'email-valid',
  description: 'Email validated',
  stateDiff: { key: 'validation', before: null, after: { valid: true } },
  timestamp: new Date(),
}, 'event-2');

doGraph.linkActionToEffect('validate-email', 'email-valid', 'event-3');

// Step 2: Set up constraints
const constraintEngine = new ConstraintEngine();

// Hard: Must have valid email before creating user
constraintEngine.addHardConstraint({
  id: 'email-required',
  description: 'Email must be validated first',
  category: 'policy',
  severity: 'hard',
  predicate: (state, action) => {
    if (action !== 'create-user') return true;
    return state.entities.get('validation')?.properties.valid === true;
  },
});

// Soft: Prefer faster actions
constraintEngine.addSoftConstraint({
  id: 'time-optimization',
  description: 'Prefer faster execution',
  category: 'time',
  severity: 'soft',
  score: (state, action, params) => {
    const time = params?.timeEstimate as number || 0;
    return 1 - time / 100;
  },
});

// Step 3: Query with planning engine
const planner = new PlanningEngine(constraintEngine);

// Register actions
planner.registerAction({
  id: 'validate-email',
  name: 'Validate Email',
  description: 'Check if email is valid',
  timeEstimate: 5,
});

planner.registerAction({
  id: 'create-user',
  name: 'Create User',
  description: 'Create new user account',
  timeEstimate: 10,
  preconditions: [
    (state) => state.entities.get('validation')?.properties.valid === true,
  ],
});

// Step 4: Get available actions with Do-Attention
const currentState = {
  id: 'state-1',
  entities: new Map([
    ['validation', {
      id: 'validation',
      type: 'ValidationState',
      properties: { valid: false },
    }],
  ]),
  relationships: [],
  constraints: [],
  timestamp: new Date(),
};

const result = planner.getAvailableActions(currentState);

console.log('Available actions:');
for (const info of result.allowed) {
  console.log(`- ${info.action.name} (score: ${info.score.toFixed(2)})`);
}

console.log('Recommended:', result.recommended?.action.name);
// Output: "Validate Email" (only action that satisfies constraints)

// Step 5: After validation, new actions become available
currentState.entities.get('validation')!.properties.valid = true;

const nextResult = planner.getAvailableActions(currentState);
console.log('Next available actions:');
for (const info of nextResult.allowed) {
  console.log(`- ${info.action.name} (score: ${info.score.toFixed(2)})`);
}
// Output: Both "Validate Email" and "Create User" now available
```

### Benefits of Do-Attention

1. **Causal Awareness**: Actions are filtered based on their causal relationships and dependencies
2. **Constraint Compliance**: Automatically enforces policies, permissions, and data zones
3. **Multi-Objective Optimization**: Balances multiple preferences (cost, time, risk)
4. **Explainability**: Clear reasoning for why actions are available or blocked
5. **Dynamic Adaptation**: Attention shifts as state changes and constraints are satisfied

### Use Cases

- **Autonomous Agents**: Select next action based on current state and goals
- **Multi-Agent Coordination**: Ensure agents respect shared policies and resources
- **Workflow Orchestration**: Plan execution sequences that satisfy all constraints
- **Interactive Systems**: Suggest available actions to users based on permissions
- **Safe AI**: Guarantee that agents never violate critical constraints

## Integration with Kernel

The constraint and planning APIs are designed to be consumed by external planning modules. The kernel can expose these APIs to allow agent and planner modules to query available actions.

```typescript
// In kernel orchestrator
import { ConstraintEngine, PlanningEngine } from '@aureus/world-model';

export class WorkflowOrchestrator {
  private constraintEngine: ConstraintEngine;
  private planningEngine: PlanningEngine;
  
  constructor() {
    this.constraintEngine = new ConstraintEngine();
    this.planningEngine = new PlanningEngine(this.constraintEngine);
    
    // Set up default constraints
    this.setupDefaultConstraints();
  }
  
  private setupDefaultConstraints() {
    // Add system-level constraints
    this.constraintEngine.addHardConstraint({
      id: 'resource-limits',
      description: 'Respect resource limits',
      category: 'policy',
      severity: 'hard',
      predicate: (state, action, params) => {
        // Check resource quotas
        return true;
      },
    });
  }
  
  /**
   * External API for agents/planners
   */
  public getPlanningEngine(): PlanningEngine {
    return this.planningEngine;
  }
  
  public getConstraintEngine(): ConstraintEngine {
    return this.constraintEngine;
  }
}
```

## API Reference

### ConstraintEngine

- `addHardConstraint(constraint: HardConstraint): void`
- `addSoftConstraint(constraint: SoftConstraint): void`
- `removeConstraint(constraintId: string): boolean`
- `getAllConstraints(): Constraint[]`
- `getConstraintsByCategory(category: ConstraintCategory): Constraint[]`
- `getConstraintsBySeverity(severity: ConstraintSeverity): Constraint[]`
- `validate(state: WorldState, action?: string, params?: Record<string, unknown>): ConstraintValidationResult`
- `isActionAllowed(state: WorldState, action: string, params?: Record<string, unknown>): boolean`
- `getActionScore(state: WorldState, action: string, params?: Record<string, unknown>): number`
- `clear(): void`

### PlanningEngine

- `registerAction(action: ActionDefinition): void`
- `unregisterAction(actionId: string): boolean`
- `getAllActions(): ActionDefinition[]`
- `getAction(actionId: string): ActionDefinition | undefined`
- `getAvailableActions(state: WorldState, options?: PlanningOptions): AvailableActionsResult`
- `isActionAvailable(actionId: string, state: WorldState, params?: Record<string, unknown>): ActionInfo | null`
- `getRecommendedAction(state: WorldState, options?: PlanningOptions): ActionInfo | undefined`
- `explainActionBlockage(actionId: string, state: WorldState, params?: Record<string, unknown>): string[]`
- `clear(): void`

## Examples

See the test files for comprehensive examples:
- `tests/constraints.test.ts` - Constraint system examples
- `tests/planning.test.ts` - Planning engine examples

## Further Reading

- [Do-Calculus and Causal Inference](https://en.wikipedia.org/wiki/Do-calculus)
- [Multi-Objective Optimization](https://en.wikipedia.org/wiki/Multi-objective_optimization)
- [Constraint Satisfaction Problems](https://en.wikipedia.org/wiki/Constraint_satisfaction_problem)
