import { TaskSpec, TaskState, WorkflowSpec, WorkflowState, StateStore, TaskExecutor, EventLog, Event, CompensationExecutor, CompensationAction } from './types';
import { FileSystemEventLog } from './event-log';
import { StateStore as WorldModelStateStore, StateSnapshot, ConflictError } from '@aureus/world-model';
import { MemoryAPI, Provenance, MemoryEntry } from '@aureus/memory-hipcortex';
import { CRVGate, Commit, GateResult, RecoveryExecutor } from '@aureus/crv';
import { GoalGuardFSM, Principal, Action, RiskTier, Intent, DataZone } from '@aureus/policy';
import { TelemetryCollector } from '@aureus/observability';
import { WorkflowExecutionError, TaskTimeoutError } from './errors';
import { FaultInjector } from './fault-injection';
import { HypothesisManager } from '@aureus/hypothesis';
import { SandboxIntegration } from './sandbox-integration';
import { FeasibilityChecker, FeasibilityCheckResult } from './feasibility';

// Static mappings for policy type conversions (avoid recreation per task)
const RISK_TIER_MAP: Record<string, RiskTier> = {
  'LOW': RiskTier.LOW,
  'MEDIUM': RiskTier.MEDIUM,
  'HIGH': RiskTier.HIGH,
  'CRITICAL': RiskTier.CRITICAL,
};

const INTENT_MAP: Record<string, Intent> = {
  'read': Intent.READ,
  'write': Intent.WRITE,
  'delete': Intent.DELETE,
  'execute': Intent.EXECUTE,
  'admin': Intent.ADMIN,
};

const DATA_ZONE_MAP: Record<string, DataZone> = {
  'public': DataZone.PUBLIC,
  'internal': DataZone.INTERNAL,
  'confidential': DataZone.CONFIDENTIAL,
  'restricted': DataZone.RESTRICTED,
};

/**
 * WorkflowOrchestrator implements durable DAG-based workflow execution
 * with retry logic, timeouts, and idempotency guarantees
 * Now includes memory integration for episodic notes and artifacts with provenance
 * CRV gate integration for verified commits (invariant 3)
 * and policy integration for action gating (invariant 4)
 */
export class WorkflowOrchestrator {
  private stateStore: StateStore;
  private executor: TaskExecutor;
  private eventLog: EventLog;
  private compensationExecutor?: CompensationExecutor;
  private worldStateStore?: WorldModelStateStore;
  private memoryAPI?: MemoryAPI;
  private crvGate?: CRVGate;
  private crvRecoveryExecutor?: RecoveryExecutor;
  private policyGuard?: GoalGuardFSM;
  private principal?: Principal;
  private telemetry?: TelemetryCollector;
  private faultInjector?: FaultInjector;
  private hypothesisManager?: HypothesisManager;
  private sandboxIntegration?: SandboxIntegration;
  private feasibilityChecker?: FeasibilityChecker;

  constructor(
    stateStore: StateStore, 
    executor: TaskExecutor, 
    eventLog?: EventLog,
    compensationExecutor?: CompensationExecutor,
    worldStateStore?: WorldModelStateStore,
    memoryAPI?: MemoryAPI,
    crvGate?: CRVGate,
    policyGuard?: GoalGuardFSM,
    principal?: Principal,
    telemetry?: TelemetryCollector,
    faultInjector?: FaultInjector,
    hypothesisManager?: HypothesisManager,
    sandboxIntegration?: SandboxIntegration,
    feasibilityChecker?: FeasibilityChecker,
    crvRecoveryExecutor?: RecoveryExecutor
  ) {
    this.stateStore = stateStore;
    this.executor = executor;
    this.eventLog = eventLog || new FileSystemEventLog();
    this.compensationExecutor = compensationExecutor;
    this.worldStateStore = worldStateStore;
    this.memoryAPI = memoryAPI;
    this.crvGate = crvGate;
    this.policyGuard = policyGuard;
    this.principal = principal;
    this.telemetry = telemetry;
    this.faultInjector = faultInjector;
    this.hypothesisManager = hypothesisManager;
    this.sandboxIntegration = sandboxIntegration || new SandboxIntegration(telemetry);
    this.feasibilityChecker = feasibilityChecker;
    this.crvRecoveryExecutor = crvRecoveryExecutor;
  }

  /**
   * Execute a workflow, resuming from persisted state if it exists
   * Guarantees: Durability (invariant 1) and Idempotency (invariant 2)
   */
  async executeWorkflow(spec: WorkflowSpec): Promise<WorkflowState> {
    // Try to load existing state for durability
    let state = await this.stateStore.loadWorkflowState(spec.id);
    
    if (!state) {
      // Initialize new workflow state
      state = {
        workflowId: spec.id,
        status: 'pending',
        taskStates: new Map(),
        startedAt: new Date(),
      };
      await this.stateStore.saveWorkflowState(state);
    }

    // Log workflow start
    await this.logEvent({
      timestamp: new Date(),
      type: 'WORKFLOW_STARTED',
      workflowId: spec.id,
      data: { name: spec.name },
    });

    // Resume execution
    state.status = 'running';
    await this.stateStore.saveWorkflowState(state);

    // Track completed steps for saga compensation
    const completedSteps: TaskSpec[] = [];

    try {
      // Execute tasks in dependency order (DAG)
      const executionOrder = this.topologicalSort(spec);
      
      for (const taskId of executionOrder) {
        const task = spec.tasks.find(t => t.id === taskId);
        if (!task) continue;

        // Check if task already completed (idempotency)
        const existingState = state.taskStates.get(taskId);
        if (existingState && existingState.status === 'completed') {
          completedSteps.push(task);
          continue; // Skip already completed tasks
        }

        // Execute task with retry logic and timeout
        const taskState = await this.executeTask(spec.id, task);
        state.taskStates.set(taskId, taskState);

        if (taskState.status === 'failed' || taskState.status === 'timeout') {
          // Check if this is a graceful failure from successful recovery (e.g., escalation)
          const isGracefulFailure = taskState.metadata?.crvRecoveryGracefulFailure === true;
          
          // Handle compensation if defined
          if (task.compensation) {
            if (taskState.status === 'timeout' && task.compensation.onTimeout) {
              await this.executeCompensation(spec, task.compensation.onTimeout);
            } else if (taskState.status === 'failed' && task.compensation.onFailure) {
              await this.executeCompensation(spec, task.compensation.onFailure);
            }
          }

          // Execute saga compensations in reverse order for completed steps
          await this.executeSagaCompensations(spec.id, completedSteps);

          state.status = 'failed';
          await this.stateStore.saveWorkflowState(state);
          await this.logEvent({
            timestamp: new Date(),
            type: 'WORKFLOW_FAILED',
            workflowId: spec.id,
            taskId: taskId,
            metadata: { error: taskState.error },
          });
          
          // If recovery was attempted gracefully (e.g., escalation), return failed state instead of throwing
          if (isGracefulFailure) {
            return state;
          }
          
          throw new WorkflowExecutionError(
            spec.id,
            taskId,
            taskState.status === 'timeout' ? 'Task execution timeout' : 'Task execution failed',
            taskState.error || 'Unknown error',
            { attempt: taskState.attempt, taskType: task.type }
          );
        }

        // Track successful completion for potential compensation
        completedSteps.push(task);
      }

      // Workflow completed successfully
      state.status = 'completed';
      state.completedAt = new Date();
      await this.stateStore.saveWorkflowState(state);
      await this.logEvent({
        timestamp: new Date(),
        type: 'WORKFLOW_COMPLETED',
        workflowId: spec.id,
      });

      return state;
    } catch (error) {
      state.status = 'failed';
      await this.stateStore.saveWorkflowState(state);
      throw error;
    }
  }

  /**
   * Execute a single task with retry logic, timeout, and idempotency
   */
  private async executeTask(workflowId: string, task: TaskSpec): Promise<TaskState> {
    // Try to load existing task state
    let taskState = await this.stateStore.loadTaskState(workflowId, task.id);
    
    if (!taskState) {
      taskState = {
        taskId: task.id,
        status: 'pending',
        attempt: 0,
      };
    }

    // Idempotency check: if task has an idempotency key and is completed, return
    if (task.idempotencyKey && taskState.status === 'completed') {
      return taskState;
    }

    const maxAttempts = task.retry?.maxAttempts || 1;
    let backoffMs = task.retry?.backoffMs || 1000;
    const backoffMultiplier = task.retry?.backoffMultiplier || 2;
    const jitter = task.retry?.jitter !== false; // Default to true

    while (taskState.attempt < maxAttempts) {
      taskState.attempt++;
      taskState.status = 'running';
      taskState.startedAt = new Date();
      await this.stateStore.saveTaskState(workflowId, taskState);
      
      const startEvent = await this.logEvent({
        timestamp: new Date(),
        type: 'TASK_STARTED',
        workflowId,
        taskId: task.id,
        metadata: { attempt: taskState.attempt },
      });

      // Record telemetry: step_start
      if (this.telemetry) {
        this.telemetry.recordStepStart(workflowId, task.id, task.type || 'unknown', {
          attempt: taskState.attempt,
          riskTier: task.riskTier,
        });
      }

      // Write episodic note for task start with provenance
      if (this.memoryAPI) {
        this.writeEpisodicNote(
          workflowId,
          task.id,
          {
            event: 'task_started',
            taskId: task.id,
            attempt: taskState.attempt,
            timestamp: taskState.startedAt,
          },
          {
            tags: ['task_lifecycle', 'started'],
            metadata: { taskType: task.type, riskTier: task.riskTier },
          }
        );
      }

      // Policy check before tool execution (invariant 4: Governance)
      if (this.policyGuard && this.principal && task.riskTier) {
        const policyAction: Action = {
          id: task.id,
          name: task.name,
          riskTier: RISK_TIER_MAP[task.riskTier] || RiskTier.LOW,
          requiredPermissions: (task.requiredPermissions || []).map(p => ({
            action: p.action,
            resource: p.resource,
            intent: p.intent ? INTENT_MAP[p.intent] : undefined,
            dataZone: p.dataZone ? DATA_ZONE_MAP[p.dataZone] : undefined,
            conditions: {},
          })),
          intent: task.intent ? INTENT_MAP[task.intent] : undefined,
          dataZone: task.dataZone ? DATA_ZONE_MAP[task.dataZone] : undefined,
          allowedTools: task.allowedTools,
        };

        const decision = await this.policyGuard.evaluate(
          this.principal,
          policyAction,
          task.toolName,
          workflowId,
          task.id
        );
        
        // Record telemetry: policy_check (already recorded in GoalGuardFSM.evaluate)
        // No need to record again here since we're passing workflowId and taskId to evaluate
        
        await this.logEvent({
          timestamp: new Date(),
          type: 'STATE_UPDATED',
          workflowId,
          taskId: task.id,
          metadata: {
            policyDecision: {
              allowed: decision.allowed,
              reason: decision.reason,
              requiresHumanApproval: decision.requiresHumanApproval,
              approvalToken: decision.approvalToken,
            },
          },
        });

        if (!decision.allowed) {
          if (decision.requiresHumanApproval) {
            taskState.status = 'failed';
            // Log approval token securely in metadata, not in error message
            taskState.error = `Policy gate blocked: ${decision.reason}. Approval required.`;
          } else {
            taskState.status = 'failed';
            taskState.error = `Policy gate blocked: ${decision.reason}`;
          }
          
          await this.stateStore.saveTaskState(workflowId, taskState);
          await this.logEvent({
            timestamp: new Date(),
            type: 'TASK_FAILED',
            workflowId,
            taskId: task.id,
            metadata: { 
              attempt: taskState.attempt, 
              error: taskState.error,
              policyBlocked: true,
            },
          });
          
          return taskState;
        }
      }

      // Feasibility check before tool execution
      if (this.feasibilityChecker) {
        const feasibilityResult = await this.feasibilityChecker.checkFeasibility(task);
        
        // Record telemetry for feasibility check
        if (this.telemetry) {
          this.telemetry.recordMetric(
            'feasibility_check',
            feasibilityResult.feasible ? 1 : 0,
            {
              workflowId,
              taskId: task.id,
              toolName: task.toolName || '',
            }
          );
        }

        // Log feasibility check result
        await this.logEvent({
          timestamp: new Date(),
          type: 'STATE_UPDATED',
          workflowId,
          taskId: task.id,
          metadata: {
            feasibilityCheck: {
              feasible: feasibilityResult.feasible,
              reasons: feasibilityResult.reasons,
              confidenceScore: feasibilityResult.confidenceScore,
              toolCapabilityCheck: feasibilityResult.toolCapabilityCheck,
            },
          },
        });

        if (!feasibilityResult.feasible) {
          taskState.status = 'failed';
          taskState.error = `Feasibility check failed: ${feasibilityResult.reasons.join('; ')}`;
          
          await this.stateStore.saveTaskState(workflowId, taskState);
          await this.logEvent({
            timestamp: new Date(),
            type: 'TASK_FAILED',
            workflowId,
            taskId: task.id,
            metadata: { 
              attempt: taskState.attempt, 
              error: taskState.error,
              feasibilityBlocked: true,
              feasibilityReasons: feasibilityResult.reasons,
            },
          });
          
          return taskState;
        }
      }

      // Take state snapshot before execution
      let beforeSnapshot: StateSnapshot | undefined;
      if (this.worldStateStore) {
        beforeSnapshot = await this.worldStateStore.snapshot();
        
        // Record telemetry: snapshot_commit
        if (this.telemetry) {
          this.telemetry.recordSnapshotCommit(workflowId, task.id, beforeSnapshot.id);
        }
        
        await this.logEvent({
          timestamp: new Date(),
          type: 'STATE_SNAPSHOT',
          workflowId,
          taskId: task.id,
          metadata: { snapshotId: beforeSnapshot.id },
        });
      }

      try {
        // Execute with fault injection if configured
        const executeTaskFn = async () => {
          // Check if sandbox is enabled for this task
          if (task.sandboxConfig && task.sandboxConfig.enabled && this.sandboxIntegration) {
            // Execute through sandbox integration
            const sandboxResult = await this.sandboxIntegration.executeInSandbox(
              task,
              taskState,
              this.executor.execute.bind(this.executor),
              {
                workflowId,
                taskId: task.id,
                principalId: this.principal?.id,
                telemetry: this.telemetry,
                memoryAPI: this.memoryAPI,
                crvGate: this.crvGate,
              }
            );

            // If sandbox execution failed, throw error
            if (!sandboxResult.success) {
              throw new Error(sandboxResult.error || 'Sandbox execution failed');
            }

            return sandboxResult.data;
          } else {
            // Normal execution without sandbox
            return task.timeoutMs
              ? await this.executeWithTimeout(task, taskState, task.timeoutMs)
              : await this.executor.execute(task, taskState);
          }
        };

        let result = this.faultInjector
          ? await this.faultInjector.injectBeforeTask(
              workflowId,
              task.id,
              task.toolName,
              executeTaskFn
            )
          : await executeTaskFn();
        
        // CRV Gate validation before committing state (invariant 3)
        // Note: Policy check happens before tool execution (see above)
        // This CRV gate validates the result before committing
        if (this.crvGate) {
          const commit: Commit = {
            id: `${workflowId}-${task.id}-${taskState.attempt}`,
            data: result,
            previousState: taskState.result,
            metadata: {
              workflowId,
              taskId: task.id,
              attempt: taskState.attempt,
            },
          };
          
          const gateResult = await this.crvGate.validate(commit);
          
          // Record telemetry: crv_result
          if (this.telemetry) {
            this.telemetry.recordCRVResult(
              workflowId,
              task.id,
              gateResult.gateName,
              gateResult.passed,
              gateResult.blockedCommit || false,
              gateResult.failure_code
            );
          }
          
          // Log CRV gate result
          await this.logEvent({
            timestamp: new Date(),
            type: 'STATE_UPDATED',
            workflowId,
            taskId: task.id,
            metadata: {
              crvGateResult: {
                passed: gateResult.passed,
                gateName: gateResult.gateName,
                blockedCommit: gateResult.blockedCommit,
              },
            },
          });
          
          if (gateResult.blockedCommit) {
            // CRV gate blocked the commit - apply recovery strategy if available
            let recoverySuccess = false;
            let recoveryMessage = '';
            let recoveredData: unknown = undefined;
            
            // Apply recovery strategy if configured and executor is available
            if (gateResult.recoveryStrategy && this.crvRecoveryExecutor) {
              try {
                let recoveryResult;
                
                switch (gateResult.recoveryStrategy.type) {
                  case 'retry_alt_tool':
                    recoveryResult = await this.crvRecoveryExecutor.executeRetryAltTool(
                      gateResult.recoveryStrategy.toolName,
                      gateResult.recoveryStrategy.maxRetries,
                      commit
                    );
                    break;
                  
                  case 'ask_user':
                    recoveryResult = await this.crvRecoveryExecutor.executeAskUser(
                      gateResult.recoveryStrategy.prompt,
                      commit
                    );
                    break;
                  
                  case 'escalate':
                    recoveryResult = await this.crvRecoveryExecutor.executeEscalate(
                      gateResult.recoveryStrategy.reason,
                      commit
                    );
                    break;
                  
                  case 'ignore':
                    // For 'ignore' strategy, we allow the commit to proceed
                    recoverySuccess = true;
                    recoveryMessage = `Validation failure ignored: ${gateResult.recoveryStrategy.justification}`;
                    recoveryResult = {
                      success: true,
                      strategy: gateResult.recoveryStrategy,
                      message: recoveryMessage,
                    };
                    break;
                  
                  default:
                    recoveryResult = {
                      success: false,
                      strategy: gateResult.recoveryStrategy,
                      message: 'Unknown recovery strategy type',
                    };
                }
                
                recoverySuccess = recoveryResult.success;
                recoveryMessage = recoveryResult.message;
                recoveredData = recoveryResult.recoveredData;
                
                // Record telemetry for recovery attempt
                if (this.telemetry) {
                  this.telemetry.recordMetric(
                    'crv_recovery_attempt',
                    recoverySuccess ? 1 : 0,
                    {
                      workflowId,
                      taskId: task.id,
                      strategyType: gateResult.recoveryStrategy.type,
                    }
                  );
                }
                
                // If recovery with 'ignore' succeeded, allow the task to proceed
                if (recoverySuccess && gateResult.recoveryStrategy.type === 'ignore') {
                  // Log recovery success for ignore strategy
                  await this.logEvent({
                    timestamp: new Date(),
                    type: 'STATE_UPDATED',
                    workflowId,
                    taskId: task.id,
                    metadata: {
                      crvRecovery: {
                        strategyType: 'ignore',
                        success: true,
                        message: 'Validation failure ignored - allowing commit to proceed',
                      },
                    },
                  });
                  // Don't block the commit, let it continue
                } else if (recoverySuccess && recoveredData !== undefined) {
                  // If recovery provided new data, validate it through CRV again
                  const recoveredCommit: Commit = {
                    id: `${workflowId}-${task.id}-${taskState.attempt}-recovered`,
                    data: recoveredData,
                    previousState: commit.previousState,
                    metadata: {
                      ...commit.metadata,
                      recovered: true,
                      recoveryStrategy: gateResult.recoveryStrategy.type,
                    },
                  };
                  
                  // Re-validate the recovered data
                  const recoveredGateResult = await this.crvGate!.validate(recoveredCommit);
                  
                  if (recoveredGateResult.passed || !recoveredGateResult.blockedCommit) {
                    // Recovered data passed validation
                    result = recoveredData;
                    
                    // Log successful recovery with data (single consolidated log)
                    await this.logEvent({
                      timestamp: new Date(),
                      type: 'STATE_UPDATED',
                      workflowId,
                      taskId: task.id,
                      metadata: {
                        crvRecovery: {
                          strategyType: gateResult.recoveryStrategy.type,
                          success: true,
                          message: `Recovered data validated successfully (revalidation passed: ${recoveredGateResult.passed})`,
                        },
                      },
                    });
                    
                    // Record telemetry for successful recovery
                    if (this.telemetry) {
                      this.telemetry.recordCRVResult(
                        workflowId,
                        task.id,
                        `${recoveredGateResult.gateName}-recovered`,
                        recoveredGateResult.passed,
                        false,
                        undefined
                      );
                    }
                    // Continue with the recovered data
                  } else {
                    // Recovered data also failed validation
                    taskState.status = 'failed';
                    taskState.error = `CRV gate blocked commit: ${gateResult.validationResults
                      .filter(r => !r.valid)
                      .map(r => r.reason)
                      .join(', ')}. Recovery provided data but it also failed validation: ${recoveredGateResult.validationResults
                      .filter(r => !r.valid)
                      .map(r => r.reason)
                      .join(', ')}`;
                    
                    await this.stateStore.saveTaskState(workflowId, taskState);
                    await this.logEvent({
                      timestamp: new Date(),
                      type: 'TASK_FAILED',
                      workflowId,
                      taskId: task.id,
                      metadata: { 
                        attempt: taskState.attempt, 
                        error: taskState.error,
                        crvBlocked: true,
                        recoveryAttempted: true,
                        recoverySuccess: true,
                        // Note: Revalidation failed
                      },
                    });
                    
                    return taskState;
                  }
                } else {
                  // Recovery failed or didn't provide data - fail the task
                  // Log recovery outcome
                  await this.logEvent({
                    timestamp: new Date(),
                    type: 'STATE_UPDATED',
                    workflowId,
                    taskId: task.id,
                    metadata: {
                      crvRecovery: {
                        strategyType: gateResult.recoveryStrategy.type,
                        success: recoverySuccess,
                        message: recoverySuccess 
                          ? `Recovery succeeded but no data provided (strategy: ${gateResult.recoveryStrategy.type})`
                          : recoveryMessage,
                      },
                    },
                  });
                  
                  taskState.status = 'failed';
                  taskState.error = `CRV gate blocked commit: ${gateResult.validationResults
                    .filter(r => !r.valid)
                    .map(r => r.reason)
                    .join(', ')}. Recovery ${recoverySuccess ? 'succeeded' : 'failed'}: ${recoveryMessage}`;
                  taskState.metadata = {
                    ...taskState.metadata,
                    crvRecoveryAttempted: true,
                    crvRecoverySuccess: recoverySuccess,
                    crvRecoveryGracefulFailure: recoverySuccess && !recoveredData, // Escalate scenario
                  };
                  
                  await this.stateStore.saveTaskState(workflowId, taskState);
                  await this.logEvent({
                    timestamp: new Date(),
                    type: 'TASK_FAILED',
                    workflowId,
                    taskId: task.id,
                    metadata: { 
                      attempt: taskState.attempt, 
                      error: taskState.error,
                      crvBlocked: true,
                      recoveryAttempted: true,
                      recoverySuccess,
                    },
                  });
                  
                  return taskState;
                }
              } catch (error) {
                // Recovery execution threw an error
                const errorMessage = error instanceof Error ? error.message : String(error);
                
                // Log recovery error
                await this.logEvent({
                  timestamp: new Date(),
                  type: 'STATE_UPDATED',
                  workflowId,
                  taskId: task.id,
                  metadata: {
                    crvRecovery: {
                      strategyType: gateResult.recoveryStrategy.type,
                      success: false,
                      message: 'Recovery strategy execution failed',
                      error: errorMessage,
                    },
                  },
                });
                
                // Fail the task
                taskState.status = 'failed';
                taskState.error = `CRV gate blocked commit and recovery failed: ${errorMessage}`;
                
                await this.stateStore.saveTaskState(workflowId, taskState);
                await this.logEvent({
                  timestamp: new Date(),
                  type: 'TASK_FAILED',
                  workflowId,
                  taskId: task.id,
                  metadata: { 
                    attempt: taskState.attempt, 
                    error: taskState.error,
                    crvBlocked: true,
                    recoveryAttempted: true,
                    recoverySuccess: false,
                  },
                });
                
                return taskState;
              }
            } else {
              // No recovery strategy or executor - fail the task
              taskState.status = 'failed';
              taskState.error = `CRV gate blocked commit: ${gateResult.validationResults
                .filter(r => !r.valid)
                .map(r => r.reason)
                .join(', ')}`;
              
              await this.stateStore.saveTaskState(workflowId, taskState);
              await this.logEvent({
                timestamp: new Date(),
                type: 'TASK_FAILED',
                workflowId,
                taskId: task.id,
                metadata: { 
                  attempt: taskState.attempt, 
                  error: taskState.error,
                  crvBlocked: true,
                  recoveryAttempted: false,
                },
              });
              
              return taskState;
            }
          }
        }
        
        taskState.status = 'completed';
        taskState.result = result;
        taskState.completedAt = new Date();
        const duration = taskState.startedAt 
          ? taskState.completedAt.getTime() - taskState.startedAt.getTime()
          : undefined;
        await this.stateStore.saveTaskState(workflowId, taskState);
        
        // Record telemetry: step_end (success)
        if (this.telemetry) {
          this.telemetry.recordStepEnd(
            workflowId,
            task.id,
            task.type || 'unknown',
            true,
            duration
          );
        }
        
        // Compute state diff after successful execution
        if (this.worldStateStore && beforeSnapshot) {
          const afterSnapshot = await this.worldStateStore.snapshot();
          const stateDiff = this.worldStateStore.diff(beforeSnapshot, afterSnapshot);
          
          await this.logEvent({
            timestamp: new Date(),
            type: 'STATE_UPDATED',
            workflowId,
            taskId: task.id,
            metadata: { 
              snapshotId: afterSnapshot.id,
              stateDiff: stateDiff.map(d => ({
                key: d.key,
                before: d.before,
                after: d.after,
                operation: d.operation,
                timestamp: d.timestamp,
              })),
            },
          });
        }

        await this.logEvent({
          timestamp: new Date(),
          type: 'TASK_COMPLETED',
          workflowId,
          taskId: task.id,
          metadata: { attempt: taskState.attempt, duration },
        });

        // Write episodic note for task completion with provenance
        if (this.memoryAPI) {
          this.writeEpisodicNote(
            workflowId,
            task.id,
            {
              event: 'task_completed',
              taskId: task.id,
              attempt: taskState.attempt,
              duration,
              result: taskState.result,
              timestamp: taskState.completedAt,
            },
            {
              tags: ['task_lifecycle', 'completed'],
              metadata: { taskType: task.type, riskTier: task.riskTier },
            }
          );
        }
        
        return taskState;
      } catch (error) {
        const isTimeout = error instanceof TimeoutError;
        taskState.error = error instanceof Error ? error.message : String(error);
        taskState.timedOut = isTimeout;
        
        if (taskState.attempt >= maxAttempts) {
          taskState.status = isTimeout ? 'timeout' : 'failed';
          await this.stateStore.saveTaskState(workflowId, taskState);
          
          // Record telemetry: step_end (failure)
          if (this.telemetry) {
            this.telemetry.recordStepEnd(
              workflowId,
              task.id,
              task.type || 'unknown',
              false,
              undefined,
              taskState.error
            );
          }
          
          await this.logEvent({
            timestamp: new Date(),
            type: isTimeout ? 'TASK_TIMEOUT' : 'TASK_FAILED',
            workflowId,
            taskId: task.id,
            metadata: { attempt: taskState.attempt, error: taskState.error },
          });
          
          return taskState;
        }

        // Retry with backoff
        taskState.status = 'retrying';
        await this.stateStore.saveTaskState(workflowId, taskState);
        
        await this.logEvent({
          timestamp: new Date(),
          type: 'TASK_RETRY',
          workflowId,
          taskId: task.id,
          metadata: { attempt: taskState.attempt, error: taskState.error },
        });
        
        // Apply jitter: random value between backoffMs * 0.5 and backoffMs * 1.5
        const delay = jitter 
          ? backoffMs * (0.5 + Math.random())
          : backoffMs;
        
        await this.sleep(delay);
        backoffMs *= backoffMultiplier;
      }
    }

    taskState.status = 'failed';
    await this.stateStore.saveTaskState(workflowId, taskState);
    return taskState;
  }

  /**
   * Execute a task with a timeout
   */
  private async executeWithTimeout(
    task: TaskSpec,
    state: TaskState,
    timeoutMs: number
  ): Promise<unknown> {
    let timeoutHandle: NodeJS.Timeout;
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new TimeoutError(`Task ${task.id} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([
        this.executor.execute(task, state),
        timeoutPromise,
      ]);
      clearTimeout(timeoutHandle!);
      return result;
    } catch (error) {
      clearTimeout(timeoutHandle!);
      throw error;
    }
  }

  /**
   * Execute compensation task
   */
  private async executeCompensation(spec: WorkflowSpec, compensationTaskId: string): Promise<void> {
    const compensationTask = spec.tasks.find(t => t.id === compensationTaskId);
    if (!compensationTask) {
      return;
    }

    await this.logEvent({
      timestamp: new Date(),
      type: 'COMPENSATION_TRIGGERED',
      workflowId: spec.id,
      taskId: compensationTaskId,
    });

    // Execute compensation without throwing on failure
    try {
      await this.executeTask(spec.id, compensationTask);
    } catch (error) {
      // Log compensation failure to event log
      await this.logEvent({
        timestamp: new Date(),
        type: 'TASK_FAILED',
        workflowId: spec.id,
        taskId: compensationTaskId,
        metadata: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  /**
   * Execute saga compensations in reverse order for completed steps
   * This ensures proper cleanup when a workflow fails after some steps succeed
   */
  private async executeSagaCompensations(workflowId: string, completedSteps: TaskSpec[]): Promise<void> {
    // Filter steps that have compensation actions
    const stepsWithCompensation = completedSteps.filter(step => step.compensationAction);
    
    if (stepsWithCompensation.length === 0) {
      return;
    }

    // Execute compensations in reverse order (LIFO)
    for (let i = stepsWithCompensation.length - 1; i >= 0; i--) {
      const step = stepsWithCompensation[i];
      const compensationAction = step.compensationAction!;

      await this.logEvent({
        timestamp: new Date(),
        type: 'COMPENSATION_TRIGGERED',
        workflowId,
        taskId: step.id,
        metadata: { compensationFor: step.id },
      });

      try {
        // Execute compensation action using CompensationExecutor if available
        if (this.compensationExecutor) {
          await this.compensationExecutor.execute(compensationAction, workflowId, step.id);
          
          await this.logEvent({
            timestamp: new Date(),
            type: 'COMPENSATION_COMPLETED',
            workflowId,
            taskId: step.id,
            data: { tool: compensationAction.tool, args: compensationAction.args },
          });
        }
      } catch (error) {
        // Log compensation failure but continue with other compensations
        await this.logEvent({
          timestamp: new Date(),
          type: 'COMPENSATION_FAILED',
          workflowId,
          taskId: step.id,
          metadata: { 
            error: error instanceof Error ? error.message : String(error),
            compensationFor: step.id,
          },
        });
      }
    }
  }

  /**
   * Log an event to the event log
   */
  private async logEvent(event: Event): Promise<void> {
    try {
      await this.eventLog.append(event);
    } catch (error) {
      // Log to event log failed - this is a critical issue but we don't want to fail the workflow
      // In production, this should use a fallback logging mechanism
      if (typeof process !== 'undefined' && process.stderr) {
        process.stderr.write(`Failed to log event: ${error}\n`);
      }
    }
  }

  /**
   * Write an episodic note to memory with provenance
   * Requires task_id, step_id, and source_event_id
   */
  writeEpisodicNote(
    workflowId: string,
    taskId: string,
    content: unknown,
    options?: {
      source_event_id?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    }
  ): MemoryEntry | undefined {
    if (!this.memoryAPI) {
      console.warn('Memory API not configured, skipping episodic note');
      return undefined;
    }

    const provenance: Provenance = {
      task_id: workflowId,
      step_id: taskId,
      source_event_id: options?.source_event_id,
      timestamp: new Date(),
    };

    return this.memoryAPI.write(content, provenance, {
      type: 'episodic_note',
      tags: options?.tags,
      metadata: options?.metadata,
    });
  }

  /**
   * Write an artifact to memory with provenance
   * Requires task_id, step_id, and source_event_id
   */
  writeArtifact(
    workflowId: string,
    taskId: string,
    content: unknown,
    options?: {
      source_event_id?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    }
  ): MemoryEntry | undefined {
    if (!this.memoryAPI) {
      console.warn('Memory API not configured, skipping artifact');
      return undefined;
    }

    const provenance: Provenance = {
      task_id: workflowId,
      step_id: taskId,
      source_event_id: options?.source_event_id,
      timestamp: new Date(),
    };

    return this.memoryAPI.write(content, provenance, {
      type: 'artifact',
      tags: options?.tags,
      metadata: options?.metadata,
    });
  }

  /**
   * Write a snapshot to memory with provenance
   */
  writeSnapshot(
    workflowId: string,
    taskId: string,
    content: unknown,
    options?: {
      source_event_id?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
    }
  ): MemoryEntry | undefined {
    if (!this.memoryAPI) {
      console.warn('Memory API not configured, skipping snapshot');
      return undefined;
    }

    const provenance: Provenance = {
      task_id: workflowId,
      step_id: taskId,
      source_event_id: options?.source_event_id,
      timestamp: new Date(),
    };

    return this.memoryAPI.write(content, provenance, {
      type: 'snapshot',
      tags: options?.tags,
      metadata: options?.metadata,
    });
  }

  /**
   * Get the memory timeline for a workflow
   */
  getMemoryTimeline(workflowId: string): MemoryEntry[] {
    if (!this.memoryAPI) {
      return [];
    }
    return this.memoryAPI.list_timeline(workflowId);
  }

  /**
   * Get the memory API instance
   */
  getMemoryAPI(): MemoryAPI | undefined {
    return this.memoryAPI;
  }

  /**
   * Get the telemetry collector instance
   */
  getTelemetryCollector(): TelemetryCollector | undefined {
    return this.telemetry;
  }

  /**
   * Topological sort for DAG task execution order
   */
  private topologicalSort(spec: WorkflowSpec): string[] {
    const visited = new Set<string>();
    const result: string[] = [];
    
    const visit = (taskId: string) => {
      if (visited.has(taskId)) return;
      visited.add(taskId);
      
      const deps = spec.dependencies.get(taskId) || [];
      for (const depId of deps) {
        visit(depId);
      }
      
      result.push(taskId);
    };

    for (const task of spec.tasks) {
      visit(task.id);
    }

    return result;
  }

  /**
   * Get the hypothesis manager if configured
   */
  getHypothesisManager(): HypothesisManager | undefined {
    return this.hypothesisManager;
  }

  /**
   * Set the hypothesis manager
   */
  setHypothesisManager(manager: HypothesisManager): void {
    this.hypothesisManager = manager;
  }

  /**
   * Get the feasibility checker if configured
   */
  getFeasibilityChecker(): FeasibilityChecker | undefined {
    return this.feasibilityChecker;
  }

  /**
   * Set the feasibility checker
   */
  setFeasibilityChecker(checker: FeasibilityChecker): void {
    this.feasibilityChecker = checker;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * TimeoutError is thrown when a task exceeds its timeout
 */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}
