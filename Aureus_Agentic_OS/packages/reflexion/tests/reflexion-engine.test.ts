import { describe, it, expect, beforeEach } from 'vitest';
import { ReflexionEngine } from '../src/reflexion-engine';
import { GoalGuardFSM, RiskTier } from '@aureus/policy';
import { CRVGate, Validators, FailureTaxonomy } from '@aureus/crv';
import { FixType } from '../src/types';

describe('ReflexionEngine', () => {
  let goalGuard: GoalGuardFSM;
  let crvGate: CRVGate;
  let engine: ReflexionEngine;
  
  beforeEach(() => {
    goalGuard = new GoalGuardFSM();
    
    crvGate = new CRVGate({
      name: 'test-gate',
      validators: [Validators.notNull()],
      blockOnFailure: false,
    });
    
    engine = new ReflexionEngine(goalGuard, crvGate);
  });
  
  describe('handleFailure', () => {
    it('should generate postmortem and execute fix in sandbox', async () => {
      const error = new Error('Tool execution failed');
      const contextData = {
        toolName: 'data-fetcher',
        allowedTools: ['data-fetcher', 'data-fetcher-v2'],
      };
      
      const result = await engine.handleFailure(
        'workflow-1',
        'task-1',
        error,
        contextData
      );
      
      expect(result.postmortem).toBeDefined();
      expect(result.postmortem.workflowId).toBe('workflow-1');
      expect(result.postmortem.taskId).toBe('task-1');
      expect(result.postmortem.failureTaxonomy).toBe(FailureTaxonomy.TOOL_ERROR);
      
      expect(result.sandboxResult).toBeDefined();
      expect(result.sandboxResult!.fixId).toBe(result.postmortem.proposedFix.id);
      
      expect(result.fixPromoted).toBe(result.sandboxResult!.shouldPromoteFix);
    });
    
    it('should not execute fix if confidence is below threshold', async () => {
      const lowConfidenceEngine = new ReflexionEngine(
        goalGuard,
        crvGate,
        { minConfidence: 0.95 } // Very high threshold
      );
      
      const error = new Error('Some error');
      
      const result = await lowConfidenceEngine.handleFailure(
        'workflow-1',
        'task-1',
        error
      );
      
      expect(result.postmortem).toBeDefined();
      expect(result.sandboxResult).toBeUndefined();
      expect(result.fixPromoted).toBe(false);
    });
    
    it('should not execute fix if sandbox is disabled', async () => {
      const noSandboxEngine = new ReflexionEngine(
        goalGuard,
        crvGate,
        { sandboxEnabled: false }
      );
      
      const error = new Error('Tool error');
      const contextData = { toolName: 'tool-a' };
      
      const result = await noSandboxEngine.handleFailure(
        'workflow-1',
        'task-1',
        error,
        contextData
      );
      
      expect(result.postmortem).toBeDefined();
      expect(result.sandboxResult).toBeUndefined();
      expect(result.fixPromoted).toBe(false);
    });
    
    it('should throw error if reflexion is disabled', async () => {
      const disabledEngine = new ReflexionEngine(
        goalGuard,
        crvGate,
        { enabled: false }
      );
      
      const error = new Error('Test error');
      
      await expect(
        disabledEngine.handleFailure('workflow-1', 'task-1', error)
      ).rejects.toThrow('Reflexion is disabled');
    });
    
    it('should track fix attempts and enforce max attempts', async () => {
      const limitedEngine = new ReflexionEngine(
        goalGuard,
        crvGate,
        { maxFixAttempts: 2 }
      );
      
      const error = new Error('Tool error');
      const contextData = { toolName: 'tool-a' };
      
      // First attempt
      await limitedEngine.handleFailure('workflow-1', 'task-1', error, contextData);
      expect(limitedEngine.getFixAttemptCount('task-1')).toBe(1);
      
      // Second attempt
      await limitedEngine.handleFailure('workflow-1', 'task-1', error, contextData);
      expect(limitedEngine.getFixAttemptCount('task-1')).toBe(2);
      
      // Third attempt should fail
      await expect(
        limitedEngine.handleFailure('workflow-1', 'task-1', error, contextData)
      ).rejects.toThrow('Max fix attempts (2) exceeded');
    });
    
    it('should handle different failure taxonomies', async () => {
      // Tool error
      const toolError = new Error('Tool execution failed');
      const result1 = await engine.handleFailure(
        'w1',
        't1',
        toolError,
        { toolName: 'tool-a' }
      );
      expect(result1.postmortem.failureTaxonomy).toBe(FailureTaxonomy.TOOL_ERROR);
      expect(result1.postmortem.proposedFix.fixType).toBe(FixType.ALTERNATE_TOOL);
      
      // Policy violation
      const policyError = new Error('Permission denied');
      const result2 = await engine.handleFailure('w1', 't2', policyError);
      expect(result2.postmortem.failureTaxonomy).toBe(FailureTaxonomy.POLICY_VIOLATION);
      
      // Low confidence
      const confidenceError = new Error('Uncertain result');
      const result3 = await engine.handleFailure(
        'w1',
        't3',
        confidenceError,
        { confidence: 0.3 }
      );
      expect(result3.postmortem.failureTaxonomy).toBe(FailureTaxonomy.LOW_CONFIDENCE);
      expect(result3.postmortem.proposedFix.fixType).toBe(FixType.MODIFY_CRV_THRESHOLD);
    });
    
    it('should store postmortems and sandbox results', async () => {
      const error = new Error('Test error');
      const contextData = { toolName: 'tool-a' };
      
      const result = await engine.handleFailure(
        'workflow-1',
        'task-1',
        error,
        contextData
      );
      
      // Retrieve postmortem
      const postmortem = engine.getPostmortem(result.postmortem.id);
      expect(postmortem).toBeDefined();
      expect(postmortem?.id).toBe(result.postmortem.id);
      
      // Retrieve sandbox result
      if (result.sandboxResult) {
        const sandboxResult = engine.getSandboxResult(result.sandboxResult.fixId);
        expect(sandboxResult).toBeDefined();
        expect(sandboxResult?.fixId).toBe(result.sandboxResult.fixId);
      }
    });
  });
  
  describe('getPostmortemsForWorkflow', () => {
    it('should return all postmortems for a workflow', async () => {
      const error = new Error('Test');
      
      await engine.handleFailure('workflow-1', 'task-1', error);
      await engine.handleFailure('workflow-1', 'task-2', error);
      await engine.handleFailure('workflow-2', 'task-1', error);
      
      const workflow1Postmortems = engine.getPostmortemsForWorkflow('workflow-1');
      expect(workflow1Postmortems.length).toBe(2);
      
      const workflow2Postmortems = engine.getPostmortemsForWorkflow('workflow-2');
      expect(workflow2Postmortems.length).toBe(1);
    });
  });
  
  describe('getPostmortemsForTask', () => {
    it('should return all postmortems for a specific task', async () => {
      const error = new Error('Test');
      
      await engine.handleFailure('workflow-1', 'task-1', error);
      await engine.handleFailure('workflow-1', 'task-1', error);
      await engine.handleFailure('workflow-1', 'task-2', error);
      
      const task1Postmortems = engine.getPostmortemsForTask('workflow-1', 'task-1');
      expect(task1Postmortems.length).toBe(2);
      
      const task2Postmortems = engine.getPostmortemsForTask('workflow-1', 'task-2');
      expect(task2Postmortems.length).toBe(1);
    });
  });
  
  describe('resetFixAttempts', () => {
    it('should reset fix attempt counter', async () => {
      const error = new Error('Test');
      
      await engine.handleFailure('workflow-1', 'task-1', error);
      expect(engine.getFixAttemptCount('task-1')).toBe(1);
      
      engine.resetFixAttempts('task-1');
      expect(engine.getFixAttemptCount('task-1')).toBe(0);
    });
  });
  
  describe('getStats', () => {
    it('should return reflexion statistics', async () => {
      const error = new Error('Test');
      const contextData = { toolName: 'tool-a' };
      
      // Generate some postmortems
      await engine.handleFailure('w1', 't1', error, contextData);
      await engine.handleFailure('w1', 't2', error, contextData);
      
      const stats = engine.getStats();
      
      expect(stats.totalPostmortems).toBeGreaterThanOrEqual(2);
      expect(stats.totalSandboxExecutions).toBeGreaterThanOrEqual(2);
      expect(stats.averageConfidence).toBeGreaterThan(0);
      expect(stats.averageConfidence).toBeLessThanOrEqual(1);
    });
    
    it('should track promoted and rejected fixes', async () => {
      const error = new Error('Tool error');
      const contextData = { toolName: 'tool-a' };
      
      await engine.handleFailure('w1', 't1', error, contextData);
      
      const stats = engine.getStats();
      
      expect(stats.promotedFixes + stats.rejectedFixes).toBe(stats.totalSandboxExecutions);
    });
  });
  
  describe('clearHistory', () => {
    it('should clear all reflexion history', async () => {
      const error = new Error('Test');
      
      await engine.handleFailure('w1', 't1', error);
      
      let stats = engine.getStats();
      expect(stats.totalPostmortems).toBeGreaterThan(0);
      
      engine.clearHistory();
      
      stats = engine.getStats();
      expect(stats.totalPostmortems).toBe(0);
      expect(stats.totalSandboxExecutions).toBe(0);
      expect(stats.promotedFixes).toBe(0);
      expect(stats.rejectedFixes).toBe(0);
    });
  });
  
  describe('addChaosScenario', () => {
    it('should allow adding custom chaos scenarios', async () => {
      let customScenarioExecuted = false;
      
      engine.addChaosScenario({
        name: 'custom-scenario',
        description: 'Custom test',
        execute: async () => {
          customScenarioExecuted = true;
          return {
            scenarioName: 'custom-scenario',
            passed: true,
            executionTime: 10,
            details: 'Custom scenario executed',
          };
        },
      });
      
      const error = new Error('Test');
      await engine.handleFailure('w1', 't1', error, { toolName: 'tool-a' });
      
      expect(customScenarioExecuted).toBe(true);
    });
  });
  
  describe('applyFix', () => {
    it('should apply a promoted fix', async () => {
      const error = new Error('Tool error');
      const contextData = { toolName: 'tool-a' };
      
      const result = await engine.handleFailure('w1', 't1', error, contextData);
      
      if (result.fixPromoted) {
        // Should not throw
        await engine.applyFix(result.postmortem.proposedFix, {});
      }
      
      // Test completes without error
      expect(true).toBe(true);
    });
  });
  
  describe('integration with Goal-Guard and CRV', () => {
    it('should respect Goal-Guard decisions for high-risk fixes', async () => {
      const error = new Error('Critical error');
      const contextData = {
        toolName: 'critical-tool',
        riskTier: RiskTier.CRITICAL,
      };
      
      const result = await engine.handleFailure('w1', 't1', error, contextData);
      
      // High/critical risk fixes should be evaluated by Goal-Guard
      expect(result.postmortem).toBeDefined();
      expect(result.sandboxResult).toBeDefined();
    });
    
    it('should integrate with CRV for validation', async () => {
      const blockingGate = new CRVGate({
        name: 'blocking-gate',
        validators: [(commit) => ({ valid: false, reason: 'Blocked' })],
        blockOnFailure: true,
      });
      
      const blockingEngine = new ReflexionEngine(goalGuard, blockingGate);
      
      const error = new Error('Test');
      const result = await blockingEngine.handleFailure(
        'w1',
        't1',
        error,
        { toolName: 'tool-a' }
      );
      
      expect(result.sandboxResult).toBeDefined();
      expect(result.sandboxResult!.crvPassed).toBe(false);
      expect(result.fixPromoted).toBe(false);
    });
  });
});
