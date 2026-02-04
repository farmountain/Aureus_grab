/**
 * Example: Using Constraints and Planning with Do-Graph for Do-Attention
 * 
 * This example demonstrates how to combine the Do-Graph's causal reasoning
 * with the constraint system and planning engine to implement Do-Attention,
 * a novel attention mechanism for AI agents.
 */

import {
  DoGraph,
  WorldState,
  ConstraintEngine,
  PlanningEngine,
  HardConstraint,
  SoftConstraint,
  ActionDefinition,
} from '../src/index';

// ============================================================================
// Scenario: User Registration Workflow with Constraints
// ============================================================================

function setupScenario() {
  // Initial world state
  const initialState: WorldState = {
    id: 'state-1',
    entities: new Map([
      ['current-user', {
        id: 'current-user',
        type: 'User',
        properties: {
          role: 'admin',
          permissions: ['read', 'write', 'validate', 'create-user'],
          budget: 1000,
        },
      }],
      ['validation-state', {
        id: 'validation-state',
        type: 'ValidationState',
        properties: {
          emailValid: false,
          passwordValid: false,
        },
      }],
    ]),
    relationships: [],
    constraints: [],
    timestamp: new Date(),
  };

  return initialState;
}

function setupDoGraph(): DoGraph {
  const graph = new DoGraph();

  // Build causal graph for user registration workflow
  // Step 1: Validate email
  graph.addAction({
    id: 'validate-email',
    name: 'Validate Email',
    toolCall: 'email.validate',
    inputs: { email: 'user@example.com' },
    timestamp: new Date(),
  }, 'event-1');

  graph.addEffect({
    id: 'email-valid',
    description: 'Email validation successful',
    stateDiff: {
      key: 'validation-state',
      before: { emailValid: false },
      after: { emailValid: true },
    },
    timestamp: new Date(),
  }, 'event-2');

  graph.linkActionToEffect('validate-email', 'email-valid', 'event-3');

  // Step 2: Validate password
  graph.addAction({
    id: 'validate-password',
    name: 'Validate Password',
    toolCall: 'password.validate',
    inputs: { password: '********' },
    timestamp: new Date(),
  }, 'event-4');

  graph.addEffect({
    id: 'password-valid',
    description: 'Password validation successful',
    stateDiff: {
      key: 'validation-state',
      before: { passwordValid: false },
      after: { passwordValid: true },
    },
    timestamp: new Date(),
  }, 'event-5');

  graph.linkActionToEffect('validate-password', 'password-valid', 'event-6');

  // Step 3: Create user (enabled by both validations)
  graph.addAction({
    id: 'create-user',
    name: 'Create User',
    toolCall: 'database.createUser',
    inputs: { email: 'user@example.com', password: '********' },
    timestamp: new Date(),
  }, 'event-7');

  graph.linkEffectToAction('email-valid', 'create-user', 'event-8');
  graph.linkEffectToAction('password-valid', 'create-user', 'event-9');

  graph.addEffect({
    id: 'user-created',
    description: 'User account created',
    stateDiff: {
      key: 'user:123',
      before: null,
      after: { id: 123, email: 'user@example.com' },
    },
    timestamp: new Date(),
  }, 'event-10');

  graph.linkActionToEffect('create-user', 'user-created', 'event-11');

  // Step 4: Send welcome email (enabled by user creation)
  graph.addAction({
    id: 'send-welcome',
    name: 'Send Welcome Email',
    toolCall: 'email.send',
    inputs: { to: 'user@example.com', template: 'welcome' },
    timestamp: new Date(),
  }, 'event-12');

  graph.linkEffectToAction('user-created', 'send-welcome', 'event-13');

  graph.addEffect({
    id: 'email-sent',
    description: 'Welcome email sent',
    stateDiff: {
      key: 'email:welcome:123',
      before: null,
      after: { sent: true, timestamp: new Date() },
    },
    timestamp: new Date(),
  }, 'event-14');

  graph.linkActionToEffect('send-welcome', 'email-sent', 'event-15');

  return graph;
}

function setupConstraints(): ConstraintEngine {
  const engine = new ConstraintEngine();

  // Hard Constraint 1: Permission check
  const permissionConstraint: HardConstraint = {
    id: 'permission-check',
    description: 'User must have required permission for action',
    category: 'policy',
    severity: 'hard',
    predicate: (state, action) => {
      const user = state.entities.get('current-user');
      const permissions = (user?.properties.permissions as string[]) || [];
      
      // Map actions to required permissions
      const permissionMap: Record<string, string> = {
        'validate-email': 'validate',
        'validate-password': 'validate',
        'create-user': 'create-user',
        'send-welcome': 'write',
      };
      
      const requiredPermission = permissionMap[action!];
      if (!requiredPermission) return true; // No specific permission required
      
      return permissions.includes(requiredPermission);
    },
    violationMessage: 'User lacks required permission',
  };

  engine.addHardConstraint(permissionConstraint);

  // Hard Constraint 2: Validation must be complete before user creation
  const validationConstraint: HardConstraint = {
    id: 'validation-required',
    description: 'Email and password must be validated before creating user',
    category: 'policy',
    severity: 'hard',
    predicate: (state, action) => {
      if (action !== 'create-user') return true;
      
      const validation = state.entities.get('validation-state');
      const emailValid = validation?.properties.emailValid as boolean;
      const passwordValid = validation?.properties.passwordValid as boolean;
      
      return emailValid && passwordValid;
    },
    violationMessage: 'Validation incomplete',
  };

  engine.addHardConstraint(validationConstraint);

  // Hard Constraint 3: User must exist before sending welcome email
  const userExistsConstraint: HardConstraint = {
    id: 'user-exists',
    description: 'User must exist before sending welcome email',
    category: 'policy',
    severity: 'hard',
    predicate: (state, action) => {
      if (action !== 'send-welcome') return true;
      
      // Check if any user entity exists
      for (const [key, entity] of state.entities) {
        if (key.startsWith('user:') && entity.type === 'User') {
          return true;
        }
      }
      return false;
    },
    violationMessage: 'No user found',
  };

  engine.addHardConstraint(userExistsConstraint);

  // Soft Constraint 1: Cost optimization
  const costConstraint: SoftConstraint = {
    id: 'cost-optimization',
    description: 'Prefer lower cost actions',
    category: 'cost',
    severity: 'soft',
    score: (state, action) => {
      const user = state.entities.get('current-user');
      const budget = (user?.properties.budget as number) || 0;
      
      // Estimated costs for actions
      const costs: Record<string, number> = {
        'validate-email': 5,
        'validate-password': 5,
        'create-user': 50,
        'send-welcome': 10,
      };
      
      const cost = costs[action!] || 0;
      
      // Score based on budget utilization
      if (budget === 0) return 0;
      const utilization = cost / budget;
      return Math.max(0, 1 - utilization);
    },
    weight: 2.0,
  };

  engine.addSoftConstraint(costConstraint);

  // Soft Constraint 2: Time optimization
  const timeConstraint: SoftConstraint = {
    id: 'time-optimization',
    description: 'Prefer faster actions',
    category: 'time',
    severity: 'soft',
    score: (state, action) => {
      // Estimated time in seconds
      const times: Record<string, number> = {
        'validate-email': 2,
        'validate-password': 1,
        'create-user': 5,
        'send-welcome': 3,
      };
      
      const time = times[action!] || 0;
      const maxTime = 10;
      
      return Math.max(0, 1 - time / maxTime);
    },
    weight: 1.0,
  };

  engine.addSoftConstraint(timeConstraint);

  // Soft Constraint 3: Risk minimization
  const riskConstraint: SoftConstraint = {
    id: 'risk-minimization',
    description: 'Prefer lower risk actions',
    category: 'risk',
    severity: 'soft',
    score: (state, action) => {
      // Risk levels (0-1)
      const risks: Record<string, number> = {
        'validate-email': 0.1,
        'validate-password': 0.1,
        'create-user': 0.4, // Higher risk - database write
        'send-welcome': 0.2,
      };
      
      const risk = risks[action!] || 0;
      return 1 - risk;
    },
    weight: 1.5,
  };

  engine.addSoftConstraint(riskConstraint);

  return engine;
}

function setupPlanningEngine(constraintEngine: ConstraintEngine): PlanningEngine {
  const planner = new PlanningEngine(constraintEngine);

  // Register all actions
  const actions: ActionDefinition[] = [
    {
      id: 'validate-email',
      name: 'Validate Email',
      description: 'Validate email address format and deliverability',
      cost: 5,
      timeEstimate: 2,
      riskLevel: 0.1,
      metadata: { category: 'validation', tags: ['email', 'validation'] },
    },
    {
      id: 'validate-password',
      name: 'Validate Password',
      description: 'Check password strength and requirements',
      cost: 5,
      timeEstimate: 1,
      riskLevel: 0.1,
      metadata: { category: 'validation', tags: ['password', 'validation'] },
    },
    {
      id: 'create-user',
      name: 'Create User',
      description: 'Create new user account in database',
      cost: 50,
      timeEstimate: 5,
      riskLevel: 0.4,
      preconditions: [
        (state) => {
          const validation = state.entities.get('validation-state');
          return validation?.properties.emailValid === true &&
                 validation?.properties.passwordValid === true;
        },
      ],
      metadata: { category: 'user-management', tags: ['user', 'create'] },
    },
    {
      id: 'send-welcome',
      name: 'Send Welcome Email',
      description: 'Send welcome email to new user',
      cost: 10,
      timeEstimate: 3,
      riskLevel: 0.2,
      preconditions: [
        (state) => {
          // Check if user exists
          for (const [key] of state.entities) {
            if (key.startsWith('user:') && key !== 'current-user') {
              return true;
            }
          }
          return false;
        },
      ],
      metadata: { category: 'email', tags: ['email', 'notification'] },
    },
  ];

  actions.forEach(action => planner.registerAction(action));

  return planner;
}

// ============================================================================
// Main Example: Demonstrating Do-Attention
// ============================================================================

function demonstrateDoAttention() {
  console.log('='.repeat(80));
  console.log('Do-Attention Example: User Registration Workflow');
  console.log('='.repeat(80));
  console.log();

  // Setup
  const state = setupScenario();
  const doGraph = setupDoGraph();
  const constraintEngine = setupConstraints();
  const planner = setupPlanningEngine(constraintEngine);

  // ========================================================================
  // Phase 1: Initial state - what actions are available?
  // ========================================================================
  console.log('Phase 1: Initial State');
  console.log('-'.repeat(80));
  console.log('Current validations: email=false, password=false');
  console.log();

  let result = planner.getAvailableActions(state, {
    sortBy: 'score',
    sortDirection: 'desc',
  });

  console.log(`Found ${result.allowed.length} available actions:`);
  result.allowed.forEach((info, idx) => {
    console.log(`  ${idx + 1}. ${info.action.name}`);
    console.log(`     Score: ${info.score.toFixed(3)} | Cost: $${info.action.cost} | Time: ${info.action.timeEstimate}s | Risk: ${info.action.riskLevel}`);
  });

  if (result.blocked.length > 0) {
    console.log();
    console.log(`Blocked actions: ${result.blocked.length}`);
    result.blocked.forEach(info => {
      console.log(`  - ${info.action.name}`);
      const reasons = planner.explainActionBlockage(info.action.id, state);
      reasons.forEach(reason => console.log(`    • ${reason}`));
    });
  }

  console.log();
  console.log(`✓ Recommended action: ${result.recommended?.action.name}`);
  console.log();

  // ========================================================================
  // Phase 2: After email validation
  // ========================================================================
  console.log('Phase 2: After Email Validation');
  console.log('-'.repeat(80));
  
  // Update state
  const validationState = state.entities.get('validation-state');
  if (validationState) {
    validationState.properties.emailValid = true;
  }
  console.log('Current validations: email=true, password=false');
  console.log();

  result = planner.getAvailableActions(state, {
    sortBy: 'score',
    sortDirection: 'desc',
  });

  console.log(`Found ${result.allowed.length} available actions:`);
  result.allowed.forEach((info, idx) => {
    console.log(`  ${idx + 1}. ${info.action.name}`);
    console.log(`     Score: ${info.score.toFixed(3)} | Cost: $${info.action.cost} | Time: ${info.action.timeEstimate}s | Risk: ${info.action.riskLevel}`);
  });

  console.log();
  console.log(`✓ Recommended action: ${result.recommended?.action.name}`);
  console.log();

  // ========================================================================
  // Phase 3: After both validations complete
  // ========================================================================
  console.log('Phase 3: After Password Validation');
  console.log('-'.repeat(80));
  
  // Update state
  if (validationState) {
    validationState.properties.passwordValid = true;
  }
  console.log('Current validations: email=true, password=true');
  console.log();

  result = planner.getAvailableActions(state, {
    sortBy: 'score',
    sortDirection: 'desc',
  });

  console.log(`Found ${result.allowed.length} available actions:`);
  result.allowed.forEach((info, idx) => {
    console.log(`  ${idx + 1}. ${info.action.name}`);
    console.log(`     Score: ${info.score.toFixed(3)} | Cost: $${info.action.cost} | Time: ${info.action.timeEstimate}s | Risk: ${info.action.riskLevel}`);
  });

  console.log();
  console.log(`✓ Recommended action: ${result.recommended?.action.name}`);
  console.log('  → This action will create the user account');
  console.log();

  // ========================================================================
  // Phase 4: After user creation
  // ========================================================================
  console.log('Phase 4: After User Creation');
  console.log('-'.repeat(80));
  
  // Update state - add created user
  state.entities.set('user:123', {
    id: 'user:123',
    type: 'User',
    properties: { id: 123, email: 'user@example.com' },
  });
  console.log('User created: user:123');
  console.log();

  result = planner.getAvailableActions(state, {
    sortBy: 'score',
    sortDirection: 'desc',
  });

  console.log(`Found ${result.allowed.length} available actions:`);
  result.allowed.forEach((info, idx) => {
    console.log(`  ${idx + 1}. ${info.action.name}`);
    console.log(`     Score: ${info.score.toFixed(3)} | Cost: $${info.action.cost} | Time: ${info.action.timeEstimate}s | Risk: ${info.action.riskLevel}`);
  });

  console.log();
  console.log(`✓ Recommended action: ${result.recommended?.action.name}`);
  console.log('  → This action will complete the workflow');
  console.log();

  // ========================================================================
  // Causal Analysis: Why send welcome email?
  // ========================================================================
  console.log('Causal Analysis: Why Send Welcome Email?');
  console.log('-'.repeat(80));
  
  const whyResult = doGraph.why('email-sent');
  if (whyResult) {
    console.log(`Effect: ${whyResult.effect.description}`);
    console.log();
    console.log('Causal chain:');
    whyResult.actions.forEach((action, idx) => {
      console.log(`  ${idx + 1}. ${action.name} (${action.id})`);
    });
    console.log();
    console.log('Full causal path:');
    whyResult.path.forEach((node, idx) => {
      const prefix = idx === 0 ? '  ' : '  → ';
      const type = node.type === 'action' ? 'Action' : 'Effect';
      const name = node.type === 'action' 
        ? (node as any).name 
        : (node as any).description;
      console.log(`${prefix}[${type}] ${name}`);
    });
  }

  console.log();
  console.log('='.repeat(80));
  console.log('Summary: Do-Attention in Action');
  console.log('='.repeat(80));
  console.log();
  console.log('Do-Attention combines:');
  console.log('  1. Causal reasoning (Do-Graph) - understands dependencies');
  console.log('  2. Hard constraints - enforces policies and permissions');
  console.log('  3. Soft constraints - optimizes for cost, time, and risk');
  console.log('  4. Dynamic filtering - adapts as state changes');
  console.log();
  console.log('Benefits:');
  console.log('  ✓ Safe: Never violates critical constraints');
  console.log('  ✓ Optimal: Balances multiple objectives');
  console.log('  ✓ Explainable: Clear reasoning for recommendations');
  console.log('  ✓ Adaptive: Updates as state and constraints change');
  console.log();
}

// Run the example if executed directly
if (typeof require !== 'undefined' && require.main === module) {
  demonstrateDoAttention();
}

export {
  setupScenario,
  setupDoGraph,
  setupConstraints,
  setupPlanningEngine,
  demonstrateDoAttention,
};
