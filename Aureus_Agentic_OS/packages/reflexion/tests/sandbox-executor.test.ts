import { describe, it, expect, beforeEach } from 'vitest';
import { SandboxExecutor } from '../src/sandbox-executor';
import { GoalGuardFSM, RiskTier } from '@aureus/policy';
import { CRVGate, Validators } from '@aureus/crv';
import { ProposedFix, FixType, ChaosTestScenario } from '../src/types';

describe('SandboxExecutor', () => {
  let goalGuard: GoalGuardFSM;
  let crvGate: CRVGate;
  let executor: SandboxExecutor;
  
  beforeEach(() => {
    goalGuard = new GoalGuardFSM();
    
    // Create a permissive CRV gate for testing
    crvGate = new CRVGate(
      {
        name: 'test-gate',
        validators: [Validators.notNull()],
        blockOnFailure: false,
      }
    );
    
    executor = new SandboxExecutor(goalGuard, crvGate);
  });
  
  describe('executeFix', () => {
    it('should execute and validate an alternate tool fix', async () => {
      const proposedFix: ProposedFix = {
        id: 'fix-1',
        description: 'Replace tool-a with tool-b',
        fixType: FixType.ALTERNATE_TOOL,
        alternateToolSelection: {
          originalTool: 'tool-a',
          alternativeTool: 'tool-b',
          reason: 'tool-a failed',
        },
        riskTier: RiskTier.LOW,
        estimatedImpact: 'low',
      };
      
      const result = await executor.executeFix(
        proposedFix,
        'workflow-1',
        'task-1',
        {
          taxonomy: 'TOOL_ERROR',
          rootCause: 'Tool execution failed',
        }
      );
      
      expect(result.fixId).toBe('fix-1');
      expect(result.goalGuardApproved).toBe(true);
      expect(result.crvPassed).toBe(true);
      expect(result.executionTime).toBeGreaterThan(0);
      expect(result.logs).toBeDefined();
      expect(result.logs!.length).toBeGreaterThan(0);
    });
    
    it('should execute and validate a CRV threshold fix', async () => {
      const proposedFix: ProposedFix = {
        id: 'fix-2',
        description: 'Adjust confidence threshold',
        fixType: FixType.MODIFY_CRV_THRESHOLD,
        modifiedCRVThresholds: [
          {
            operatorName: 'confidence-check',
            originalThreshold: 0.8,
            newThreshold: 0.7,
            withinPolicyBounds: true,
          },
        ],
        riskTier: RiskTier.MEDIUM,
        estimatedImpact: 'medium',
      };
      
      const result = await executor.executeFix(
        proposedFix,
        'workflow-1',
        'task-1',
        {
          taxonomy: 'LOW_CONFIDENCE',
          rootCause: 'Confidence below threshold',
        }
      );
      
      expect(result.fixId).toBe('fix-2');
      expect(result.goalGuardApproved).toBe(true);
      expect(result.crvPassed).toBe(true);
    });
    
    it('should execute and validate a workflow reordering fix', async () => {
      const proposedFix: ProposedFix = {
        id: 'fix-3',
        description: 'Reorder workflow steps',
        fixType: FixType.REORDER_WORKFLOW,
        workflowStepReordering: {
          originalOrder: ['task-a', 'task-b', 'task-c'],
          newOrder: ['task-a', 'task-c', 'task-b'],
          safetyCheck: true,
        },
        riskTier: RiskTier.MEDIUM,
        estimatedImpact: 'low',
      };
      
      const result = await executor.executeFix(
        proposedFix,
        'workflow-1',
        'task-b',
        {
          taxonomy: 'NON_DETERMINISM',
          rootCause: 'Race condition detected',
        }
      );
      
      expect(result.fixId).toBe('fix-3');
      expect(result.goalGuardApproved).toBe(true);
    });
    
    it('should run default chaos tests', async () => {
      const proposedFix: ProposedFix = {
        id: 'fix-4',
        description: 'Test fix',
        fixType: FixType.ALTERNATE_TOOL,
        alternateToolSelection: {
          originalTool: 'tool-a',
          alternativeTool: 'tool-b',
          reason: 'testing',
        },
        riskTier: RiskTier.LOW,
        estimatedImpact: 'low',
      };
      
      const result = await executor.executeFix(
        proposedFix,
        'workflow-1',
        'task-1',
        {
          taxonomy: 'TOOL_ERROR',
          rootCause: 'Test failure',
        }
      );
      
      // Default chaos tests should run
      expect(result.chaosTestsPassed).toBe(true);
      expect(result.logs).toBeDefined();
      
      const chaosLogs = result.logs!.filter(log => log.includes('chaos'));
      expect(chaosLogs.length).toBeGreaterThan(0);
    });
    
    it('should promote fix when all validations pass', async () => {
      const proposedFix: ProposedFix = {
        id: 'fix-5',
        description: 'Valid fix',
        fixType: FixType.ALTERNATE_TOOL,
        alternateToolSelection: {
          originalTool: 'tool-a',
          alternativeTool: 'tool-b',
          reason: 'testing',
        },
        riskTier: RiskTier.LOW,
        estimatedImpact: 'low',
      };
      
      const result = await executor.executeFix(
        proposedFix,
        'workflow-1',
        'task-1',
        {
          taxonomy: 'TOOL_ERROR',
          rootCause: 'Test',
        }
      );
      
      expect(result.shouldPromoteFix).toBe(true);
      expect(result.promotionReason).toContain('All validation checks passed');
    });
    
    it('should not promote fix if CRV threshold is out of bounds', async () => {
      const proposedFix: ProposedFix = {
        id: 'fix-6',
        description: 'Fix with invalid threshold',
        fixType: FixType.MODIFY_CRV_THRESHOLD,
        modifiedCRVThresholds: [
          {
            operatorName: 'test-op',
            originalThreshold: 0.8,
            newThreshold: 0.3, // Too low
            withinPolicyBounds: false,
          },
        ],
        riskTier: RiskTier.HIGH,
        estimatedImpact: 'high',
      };
      
      const result = await executor.executeFix(
        proposedFix,
        'workflow-1',
        'task-1',
        {
          taxonomy: 'LOW_CONFIDENCE',
          rootCause: 'Test',
        }
      );
      
      // Chaos tests should fail for boundary conditions
      expect(result.chaosTestsPassed).toBe(false);
      expect(result.shouldPromoteFix).toBe(false);
    });
    
    it('should include error details when validation fails', async () => {
      // Create a blocking CRV gate that will reject
      const blockingGate = new CRVGate({
        name: 'blocking-gate',
        validators: [(commit) => ({ valid: false, reason: 'Always fails' })],
        blockOnFailure: true,
      });
      
      const blockingExecutor = new SandboxExecutor(goalGuard, blockingGate);
      
      const proposedFix: ProposedFix = {
        id: 'fix-7',
        description: 'Fix that will fail CRV',
        fixType: FixType.ALTERNATE_TOOL,
        alternateToolSelection: {
          originalTool: 'tool-a',
          alternativeTool: 'tool-b',
          reason: 'testing',
        },
        riskTier: RiskTier.LOW,
        estimatedImpact: 'low',
      };
      
      const result = await blockingExecutor.executeFix(
        proposedFix,
        'workflow-1',
        'task-1',
        {
          taxonomy: 'TOOL_ERROR',
          rootCause: 'Test',
        }
      );
      
      expect(result.crvPassed).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });
    
    it('should support custom chaos test scenarios', async () => {
      const customScenario: ChaosTestScenario = {
        name: 'custom-test',
        description: 'Custom chaos test',
        execute: async (context) => {
          return {
            scenarioName: 'custom-test',
            passed: context.proposedFix.riskTier === RiskTier.LOW,
            executionTime: 10,
            details: 'Custom test executed',
          };
        },
      };
      
      const customExecutor = new SandboxExecutor(
        goalGuard,
        crvGate,
        [customScenario]
      );
      
      const proposedFix: ProposedFix = {
        id: 'fix-8',
        description: 'Test custom scenario',
        fixType: FixType.ALTERNATE_TOOL,
        alternateToolSelection: {
          originalTool: 'tool-a',
          alternativeTool: 'tool-b',
          reason: 'testing',
        },
        riskTier: RiskTier.LOW,
        estimatedImpact: 'low',
      };
      
      const result = await customExecutor.executeFix(
        proposedFix,
        'workflow-1',
        'task-1',
        {
          taxonomy: 'TOOL_ERROR',
          rootCause: 'Test',
        }
      );
      
      const customTestLog = result.logs!.find(log => log.includes('custom-test'));
      expect(customTestLog).toBeDefined();
    });
    
    it('should track execution time', async () => {
      const proposedFix: ProposedFix = {
        id: 'fix-9',
        description: 'Timing test',
        fixType: FixType.ALTERNATE_TOOL,
        alternateToolSelection: {
          originalTool: 'tool-a',
          alternativeTool: 'tool-b',
          reason: 'testing',
        },
        riskTier: RiskTier.LOW,
        estimatedImpact: 'low',
      };
      
      const result = await executor.executeFix(
        proposedFix,
        'workflow-1',
        'task-1',
        {
          taxonomy: 'TOOL_ERROR',
          rootCause: 'Test',
        }
      );
      
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });
  });
  
  describe('addChaosScenario', () => {
    it('should allow adding custom scenarios after construction', async () => {
      const scenario: ChaosTestScenario = {
        name: 'late-addition',
        description: 'Added after construction',
        execute: async () => ({
          scenarioName: 'late-addition',
          passed: true,
          executionTime: 5,
          details: 'Success',
        }),
      };
      
      executor.addChaosScenario(scenario);
      
      const proposedFix: ProposedFix = {
        id: 'fix-10',
        description: 'Test late scenario',
        fixType: FixType.ALTERNATE_TOOL,
        alternateToolSelection: {
          originalTool: 'tool-a',
          alternativeTool: 'tool-b',
          reason: 'testing',
        },
        riskTier: RiskTier.LOW,
        estimatedImpact: 'low',
      };
      
      const result = await executor.executeFix(
        proposedFix,
        'workflow-1',
        'task-1',
        {
          taxonomy: 'TOOL_ERROR',
          rootCause: 'Test',
        }
      );
      
      const scenarioLog = result.logs!.find(log => log.includes('late-addition'));
      expect(scenarioLog).toBeDefined();
    });
  });
});
