import { Validator, ValidationResult, FailureTaxonomy, FailureRemediation, Commit } from '@aureus/crv';
import { WorkflowSpec, TaskSpec } from '@aureus/kernel';

/**
 * Generic workflow names that should be avoided (exact matches only)
 * These names provide no useful information about the workflow's purpose
 */
const GENERIC_WORKFLOW_NAMES = [
  'workflow',
  'untitled',
  'test',
  'temp',
  'new workflow',
  'my workflow',
  'untitled workflow',
];

/**
 * Validates that a workflow has at least one task
 */
export const validateHasTasks: Validator = async (commit: Commit): Promise<ValidationResult> => {
  const spec = commit.data as WorkflowSpec;

  if (!spec.tasks || spec.tasks.length === 0) {
    return {
      valid: false,
      reason: 'Workflow must have at least one task',
      confidence: 1.0,
      failure_code: FailureTaxonomy.MISSING_DATA,
      remediation: FailureRemediation[FailureTaxonomy.MISSING_DATA],
    };
  }

  return {
    valid: true,
    confidence: 1.0,
  };
};

/**
 * Validates that all task IDs are unique
 */
export const validateUniqueTaskIds: Validator = async (commit: Commit): Promise<ValidationResult> => {
  const spec = commit.data as WorkflowSpec;
  const taskIds = spec.tasks.map(t => t.id);
  const uniqueIds = new Set(taskIds);

  if (taskIds.length !== uniqueIds.size) {
    const duplicates = taskIds.filter((id, index) => taskIds.indexOf(id) !== index);
    return {
      valid: false,
      reason: `Duplicate task IDs found: ${[...new Set(duplicates)].join(', ')}`,
      confidence: 1.0,
      failure_code: FailureTaxonomy.CONFLICT,
      remediation: 'Ensure all task IDs are unique. Rename duplicate tasks with unique identifiers.',
    };
  }

  return {
    valid: true,
    confidence: 1.0,
  };
};

/**
 * Validates that all dependencies reference existing tasks
 */
export const validateDependenciesExist: Validator = async (commit: Commit): Promise<ValidationResult> => {
  const spec = commit.data as WorkflowSpec;
  const taskIds = new Set(spec.tasks.map(t => t.id));
  const invalidDeps: string[] = [];

  for (const [taskId, deps] of spec.dependencies.entries()) {
    // Check if the task itself exists
    if (!taskIds.has(taskId)) {
      invalidDeps.push(`Task ${taskId} in dependencies does not exist`);
    }

    // Check if all dependencies exist
    for (const depId of deps) {
      if (!taskIds.has(depId)) {
        invalidDeps.push(`Task ${taskId} depends on non-existent task ${depId}`);
      }
    }
  }

  if (invalidDeps.length > 0) {
    return {
      valid: false,
      reason: `Invalid dependencies: ${invalidDeps.join('; ')}`,
      confidence: 1.0,
      failure_code: FailureTaxonomy.CONFLICT,
      remediation: 'Ensure all dependency references point to existing tasks. Remove or update invalid dependencies.',
    };
  }

  return {
    valid: true,
    confidence: 1.0,
  };
};

/**
 * Validates that there are no circular dependencies
 */
export const validateNoCycles: Validator = async (commit: Commit): Promise<ValidationResult> => {
  const spec = commit.data as WorkflowSpec;

  const hasCycle = detectCycle(spec.dependencies);

  if (hasCycle) {
    return {
      valid: false,
      reason: 'Circular dependency detected in workflow',
      confidence: 1.0,
      failure_code: FailureTaxonomy.CONFLICT,
      remediation: 'Review task dependencies and break circular references. Tasks cannot depend on themselves directly or indirectly.',
    };
  }

  return {
    valid: true,
    confidence: 1.0,
  };
};

/**
 * Validates that high-risk tasks have retry configurations
 */
export const validateHighRiskRetries: Validator = async (commit: Commit): Promise<ValidationResult> => {
  const spec = commit.data as WorkflowSpec;
  const highRiskWithoutRetry: string[] = [];

  for (const task of spec.tasks) {
    if ((task.riskTier === 'HIGH' || task.riskTier === 'CRITICAL') && !task.retry) {
      highRiskWithoutRetry.push(task.id);
    }
  }

  if (highRiskWithoutRetry.length > 0) {
    return {
      valid: false,
      reason: `High-risk tasks without retry configuration: ${highRiskWithoutRetry.join(', ')}`,
      confidence: 0.8,
      failure_code: FailureTaxonomy.POLICY_VIOLATION,
      remediation: 'Add retry configuration to high-risk tasks to improve reliability. Consider maxAttempts and backoff strategies.',
      metadata: {
        tasks: highRiskWithoutRetry,
      },
    };
  }

  return {
    valid: true,
    confidence: 1.0,
  };
};

/**
 * Validates that tasks with critical operations have timeout configurations
 */
export const validateTimeouts: Validator = async (commit: Commit): Promise<ValidationResult> => {
  const spec = commit.data as WorkflowSpec;
  const tasksWithoutTimeout: string[] = [];

  for (const task of spec.tasks) {
    if (!task.timeoutMs || task.timeoutMs <= 0) {
      tasksWithoutTimeout.push(task.id);
    }
  }

  if (tasksWithoutTimeout.length > 0) {
    return {
      valid: false,
      reason: `Tasks without valid timeout configuration: ${tasksWithoutTimeout.join(', ')}`,
      confidence: 1.0,
      failure_code: FailureTaxonomy.POLICY_VIOLATION,
      remediation: 'Set timeoutMs for all tasks to prevent indefinite execution. Recommended: 30000ms minimum.',
      metadata: {
        tasks: tasksWithoutTimeout,
      },
    };
  }

  return {
    valid: true,
    confidence: 1.0,
  };
};

/**
 * Validates that the workflow name is meaningful (not empty or generic)
 */
export const validateWorkflowName: Validator = async (commit: Commit): Promise<ValidationResult> => {
  const spec = commit.data as WorkflowSpec;

  if (!spec.name || spec.name.trim().length === 0) {
    return {
      valid: false,
      reason: 'Workflow name cannot be empty',
      confidence: 1.0,
      failure_code: FailureTaxonomy.MISSING_DATA,
      remediation: 'Provide a descriptive name for the workflow that indicates its purpose.',
    };
  }

  // Check if the name is exactly a generic term (case-insensitive)
  const lowerName = spec.name.toLowerCase().trim();
  if (GENERIC_WORKFLOW_NAMES.includes(lowerName)) {
    return {
      valid: false,
      reason: 'Workflow name is too generic',
      confidence: 0.7,
      failure_code: FailureTaxonomy.LOW_CONFIDENCE,
      remediation: 'Use a more specific name that describes what the workflow does.',
    };
  }

  return {
    valid: true,
    confidence: 1.0,
  };
};

/**
 * Validates that modifications maintain backward compatibility
 * Checks if removed tasks might break existing dependencies
 */
export const validateBackwardCompatibility: Validator = async (commit: Commit): Promise<ValidationResult> => {
  if (!commit.previousState) {
    // No previous state, skip this validation
    return { valid: true, confidence: 1.0 };
  }

  const oldSpec = commit.previousState as WorkflowSpec;
  const newSpec = commit.data as WorkflowSpec;

  const oldTaskIds = new Set(oldSpec.tasks.map(t => t.id));
  const newTaskIds = new Set(newSpec.tasks.map(t => t.id));

  // Find removed tasks
  const removedTasks = [...oldTaskIds].filter(id => !newTaskIds.has(id));

  if (removedTasks.length === 0) {
    return { valid: true, confidence: 1.0 };
  }

  // Check if any remaining tasks depended on removed tasks
  const brokenDependencies: string[] = [];
  for (const [taskId, deps] of newSpec.dependencies.entries()) {
    for (const depId of deps) {
      if (removedTasks.includes(depId)) {
        brokenDependencies.push(`Task ${taskId} still depends on removed task ${depId}`);
      }
    }
  }

  if (brokenDependencies.length > 0) {
    return {
      valid: false,
      reason: `Backward compatibility issue: ${brokenDependencies.join('; ')}`,
      confidence: 1.0,
      failure_code: FailureTaxonomy.CONFLICT,
      remediation: 'Update dependencies before removing tasks, or remove dependent tasks as well.',
      metadata: {
        removedTasks,
        brokenDependencies,
      },
    };
  }

  return {
    valid: true,
    confidence: 1.0,
    metadata: {
      removedTasks,
      message: 'Tasks removed but no dependencies broken',
    },
  };
};

// Helper function to detect cycles in dependency graph
function detectCycle(dependencies: Map<string, string[]>): boolean {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function hasCycleDFS(taskId: string): boolean {
    visited.add(taskId);
    recursionStack.add(taskId);

    const deps = dependencies.get(taskId) || [];
    for (const depId of deps) {
      if (!visited.has(depId)) {
        if (hasCycleDFS(depId)) {
          return true;
        }
      } else if (recursionStack.has(depId)) {
        return true;
      }
    }

    recursionStack.delete(taskId);
    return false;
  }

  // Check all tasks
  for (const taskId of dependencies.keys()) {
    if (!visited.has(taskId)) {
      if (hasCycleDFS(taskId)) {
        return true;
      }
    }
  }

  return false;
}
