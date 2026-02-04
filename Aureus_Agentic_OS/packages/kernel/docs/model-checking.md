# Model-Checking and Safety Policies

The Aureus Kernel includes a compile-time model-checking system that validates workflows against safety policies **before execution**. This ensures that dangerous workflow compositions are caught early, preventing runtime failures and safety violations.

## Overview

Model-checking validates workflow specifications against declarative safety policies. Each policy consists of multiple safety rules that check for specific invariants. Violations are reported with clear error messages before the workflow is allowed to execute.

## Key Concepts

### Safety Policy

A safety policy is a collection of safety rules that define what constitutes a safe workflow. Policies can be:
- Embedded in workflow YAML files
- Passed programmatically to the loader
- Predefined (DEFAULT, STRICT, PERMISSIVE)

### Safety Rules

Safety rules are individual checks performed during model-checking:

#### 1. No Action After CRITICAL Without Approval

**Purpose**: Prevents unapproved actions from following CRITICAL risk operations.

**Rationale**: CRITICAL operations (like database deletion, financial transactions) should only be followed by:
- Their designated compensation tasks
- Explicitly approved cleanup tasks
- Tasks with `compensationAction` defined

**Configuration**:
```typescript
{
  type: 'no_action_after_critical_without_approval',
  enabled: true,
  severity: 'error',
  approvedFollowers: ['audit-log', 'cleanup']  // Optional whitelist
}
```

**Example Violation**:
```yaml
tasks:
  - id: delete-prod-db
    riskTier: CRITICAL
    compensation: { onFailure: restore-db }
  
  - id: send-email  # ❌ NOT APPROVED
    riskTier: LOW

dependencies:
  send-email:
    - delete-prod-db  # VIOLATION!
```

**Valid Pattern**:
```yaml
tasks:
  - id: delete-prod-db
    riskTier: CRITICAL
    compensation: { onFailure: restore-db }
  
  - id: restore-db  # ✓ Compensation task
    riskTier: LOW
    compensationAction:
      tool: restore-database
      args: { snapshot: latest }

dependencies:
  restore-db:
    - delete-prod-db  # OK - compensation follows CRITICAL
```

#### 2. Require Permissions for HIGH/CRITICAL Risk

**Purpose**: Ensures high-risk operations explicitly declare required permissions.

**Rationale**: HIGH and CRITICAL risk tasks must document what permissions they need for:
- Security auditing
- Access control validation
- Compliance documentation

**Configuration**:
```typescript
{
  type: 'require_permissions_for_high_risk',
  enabled: true,
  severity: 'error',
  minimumRiskTier: 'HIGH'  // or 'CRITICAL'
}
```

**Example**:
```yaml
- id: modify-prod-data
  riskTier: HIGH
  requiredPermissions:
    - action: write
      resource: production_database
      intent: write
      dataZone: confidential
```

#### 3. Require Compensation for CRITICAL

**Purpose**: Ensures CRITICAL operations have rollback/cleanup mechanisms.

**Rationale**: CRITICAL operations should be reversible or have cleanup procedures defined.

**Configuration**:
```typescript
{
  type: 'require_compensation_for_critical',
  enabled: true,
  severity: 'error'  // or 'warning'
}
```

**Valid Patterns**:
```yaml
# Option 1: Compensation hook
- id: critical-op
  riskTier: CRITICAL
  compensation:
    onFailure: rollback-task
    onTimeout: rollback-task

# Option 2: Compensation action
- id: critical-op
  riskTier: CRITICAL
  compensationAction:
    tool: rollback
    args: { strategy: 'revert' }
```

#### 4. No Cycles

**Purpose**: Ensures the workflow is a valid directed acyclic graph (DAG).

**Rationale**: Cycles would cause infinite loops or deadlocks.

**Configuration**:
```typescript
{
  type: 'no_cycles',
  enabled: true,
  severity: 'error'
}
```

#### 5. Custom Rules

**Purpose**: Define project-specific validation logic.

**Example**:
```typescript
{
  type: 'custom',
  enabled: true,
  severity: 'error',
  validate: (workflow: WorkflowSpec) => {
    // Custom validation logic
    if (workflow.tasks.length > 100) {
      return [{
        ruleType: SafetyRuleType.CUSTOM,
        severity: 'error',
        message: 'Workflow exceeds maximum task count (100)',
        taskIds: [],
      }];
    }
    return [];
  }
}
```

## Predefined Policies

### DEFAULT_SAFETY_POLICY

Balanced policy suitable for most workflows:
- ✓ No action after CRITICAL (error)
- ✓ Require permissions for HIGH+ (error)
- ✓ Require compensation for CRITICAL (warning)
- ✓ No cycles (error)

### STRICT_SAFETY_POLICY

Strictest safety checks, all rules as errors:
- ✓ All DEFAULT rules as errors
- ✓ No warnings allowed

### PERMISSIVE_SAFETY_POLICY

Minimal checks, only prevents obvious errors:
- ✓ No cycles (error)
- ✗ Other rules disabled

## Usage Examples

### In YAML Workflow Files

```yaml
id: my-workflow
name: My Workflow

safetyPolicy:
  name: custom-policy
  description: Policy for bank transfers
  failFast: false  # Collect all violations
  rules:
    - type: no_action_after_critical_without_approval
      enabled: true
      severity: error
      approvedFollowers:
        - audit-log
        - notification
    - type: require_permissions_for_high_risk
      enabled: true
      severity: error
      minimumRiskTier: HIGH
    - type: no_cycles
      enabled: true
      severity: error

tasks:
  # ... task definitions
```

### Programmatic Usage

```typescript
import {
  loadTaskSpec,
  WorkflowChecker,
  WorkflowValidationError,
  SafetyPolicy,
  SafetyRuleType,
} from '@aureus/kernel';

// Load with default validation
try {
  const workflow = await loadTaskSpec('workflow.yaml');
  console.log('Workflow is safe to execute');
} catch (error) {
  if (error instanceof WorkflowValidationError) {
    console.error(WorkflowChecker.formatValidationResult(error.result));
  }
}

// Custom policy
const customPolicy: SafetyPolicy = {
  name: 'production',
  rules: [
    {
      type: SafetyRuleType.NO_ACTION_AFTER_CRITICAL_WITHOUT_APPROVAL,
      enabled: true,
      severity: 'error',
    },
    {
      type: SafetyRuleType.REQUIRE_PERMISSIONS_FOR_HIGH_RISK,
      enabled: true,
      severity: 'error',
      minimumRiskTier: 'CRITICAL',
    },
  ],
};

const workflow = await loadTaskSpec('workflow.yaml', {
  safetyPolicy: customPolicy,
  strictWarnings: true,  // Treat warnings as errors
});

// Manual validation
const result = WorkflowChecker.validate(workflow, customPolicy);
console.log(WorkflowChecker.formatValidationResult(result));
```

## Best Practices

### 1. Use Appropriate Policies for Environments

- **Development**: `PERMISSIVE_SAFETY_POLICY` for rapid iteration
- **Staging**: `DEFAULT_SAFETY_POLICY` to catch issues
- **Production**: `STRICT_SAFETY_POLICY` or custom policy with all rules as errors

### 2. Document Approved Followers

When using `approvedFollowers`, document why each task is approved:

```yaml
safetyPolicy:
  rules:
    - type: no_action_after_critical_without_approval
      enabled: true
      severity: error
      approvedFollowers:
        - audit-log      # Required for compliance
        - notification   # Alerts ops team
```

### 3. Prefer Compensation Over Approval

Instead of approving arbitrary followers, define proper compensation:

```yaml
# ❌ Avoid this
- id: critical-op
  riskTier: CRITICAL
  requiredPermissions: [...]
  # No compensation

safetyPolicy:
  rules:
    - type: no_action_after_critical_without_approval
      approvedFollowers: [random-task]  # Not ideal

# ✓ Better approach
- id: critical-op
  riskTier: CRITICAL
  requiredPermissions: [...]
  compensation:
    onFailure: rollback-op
```

## See Also

- [examples/bank-transfer-safe.yaml](../examples/bank-transfer-safe.yaml) - Complete safe workflow example
- [examples/unsafe-workflow.yaml](../examples/unsafe-workflow.yaml) - Example that fails validation
- [tests/workflow-checker.test.ts](../tests/workflow-checker.test.ts) - Comprehensive test suite
- [tests/task-loader-integration.test.ts](../tests/task-loader-integration.test.ts) - Integration tests
