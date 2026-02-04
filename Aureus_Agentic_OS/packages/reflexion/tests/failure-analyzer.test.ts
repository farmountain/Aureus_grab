import { describe, it, expect, beforeEach } from 'vitest';
import { FailureAnalyzer } from '../src/failure-analyzer';
import { FailureTaxonomy } from '@aureus/crv';
import { FixType } from '../src/types';

describe('FailureAnalyzer', () => {
  let analyzer: FailureAnalyzer;
  
  beforeEach(() => {
    analyzer = new FailureAnalyzer();
  });
  
  describe('analyzeFailure', () => {
    it('should generate postmortem for tool error', async () => {
      const error = new Error('Tool execution failed');
      const contextData = {
        toolName: 'data-fetcher',
        allowedTools: ['data-fetcher', 'data-fetcher-v2'],
      };
      
      const postmortem = await analyzer.analyzeFailure(
        'workflow-1',
        'task-1',
        error,
        contextData
      );
      
      expect(postmortem.workflowId).toBe('workflow-1');
      expect(postmortem.taskId).toBe('task-1');
      expect(postmortem.failureTaxonomy).toBe(FailureTaxonomy.TOOL_ERROR);
      expect(postmortem.rootCause).toContain('TOOL_ERROR');
      expect(postmortem.rootCause).toContain('data-fetcher');
      expect(postmortem.proposedFix).toBeDefined();
      expect(postmortem.proposedFix.fixType).toBe(FixType.ALTERNATE_TOOL);
      expect(postmortem.confidence).toBeGreaterThan(0);
      expect(postmortem.confidence).toBeLessThanOrEqual(1);
    });
    
    it('should generate postmortem for missing data', async () => {
      const error = new Error('Required field is undefined');
      
      const postmortem = await analyzer.analyzeFailure(
        'workflow-1',
        'task-1',
        error
      );
      
      expect(postmortem.failureTaxonomy).toBe(FailureTaxonomy.MISSING_DATA);
    });
    
    it('should generate postmortem for policy violation', async () => {
      const error = new Error('Permission denied: unauthorized access');
      
      const postmortem = await analyzer.analyzeFailure(
        'workflow-1',
        'task-1',
        error
      );
      
      expect(postmortem.failureTaxonomy).toBe(FailureTaxonomy.POLICY_VIOLATION);
    });
    
    it('should generate postmortem for low confidence', async () => {
      const error = new Error('Operation uncertain');
      const contextData = { confidence: 0.3 };
      
      const postmortem = await analyzer.analyzeFailure(
        'workflow-1',
        'task-1',
        error,
        contextData
      );
      
      expect(postmortem.failureTaxonomy).toBe(FailureTaxonomy.LOW_CONFIDENCE);
      expect(postmortem.proposedFix.fixType).toBe(FixType.MODIFY_CRV_THRESHOLD);
    });
    
    it('should generate postmortem for non-determinism', async () => {
      const error = new Error('Non-deterministic behavior detected');
      const contextData = {
        taskOrder: ['task-1', 'task-2', 'task-3'],
        currentTaskId: 'task-2',
      };
      
      const postmortem = await analyzer.analyzeFailure(
        'workflow-1',
        'task-2',
        error,
        contextData
      );
      
      expect(postmortem.failureTaxonomy).toBe(FailureTaxonomy.NON_DETERMINISM);
      expect(postmortem.proposedFix.fixType).toBe(FixType.REORDER_WORKFLOW);
    });
    
    it('should propose alternate tool with correct details', async () => {
      const error = new Error('Tool failed');
      const contextData = {
        toolName: 'tool-a',
        allowedTools: ['tool-a', 'tool-b', 'tool-c'],
      };
      
      const postmortem = await analyzer.analyzeFailure(
        'workflow-1',
        'task-1',
        error,
        contextData
      );
      
      expect(postmortem.proposedFix.alternateToolSelection).toBeDefined();
      expect(postmortem.proposedFix.alternateToolSelection?.originalTool).toBe('tool-a');
      expect(postmortem.proposedFix.alternateToolSelection?.alternativeTool).toBe('tool-b');
      expect(postmortem.proposedFix.alternateToolSelection?.reason).toContain('failed');
    });
    
    it('should propose CRV threshold modification within bounds', async () => {
      const error = new Error('Confidence too low');
      const contextData = {
        operatorName: 'confidence-check',
        threshold: 0.8,
      };
      
      const postmortem = await analyzer.analyzeFailure(
        'workflow-1',
        'task-1',
        error,
        contextData
      );
      
      expect(postmortem.proposedFix.modifiedCRVThresholds).toBeDefined();
      expect(postmortem.proposedFix.modifiedCRVThresholds!.length).toBeGreaterThan(0);
      
      const thresholdMod = postmortem.proposedFix.modifiedCRVThresholds![0];
      expect(thresholdMod.operatorName).toBe('confidence-check');
      expect(thresholdMod.originalThreshold).toBe(0.8);
      expect(thresholdMod.newThreshold).toBeLessThan(0.8);
      expect(thresholdMod.withinPolicyBounds).toBe(true);
    });
    
    it('should propose workflow reordering with safety check', async () => {
      const error = new Error('Race condition detected');
      const contextData = {
        taskOrder: ['task-a', 'task-b', 'task-c'],
        currentTaskId: 'task-b',
        dependencies: new Map([
          ['task-c', ['task-a']], // task-c depends on task-a
        ]),
      };
      
      const postmortem = await analyzer.analyzeFailure(
        'workflow-1',
        'task-b',
        error,
        contextData
      );
      
      expect(postmortem.proposedFix.workflowStepReordering).toBeDefined();
      expect(postmortem.proposedFix.workflowStepReordering?.originalOrder).toEqual([
        'task-a',
        'task-b',
        'task-c',
      ]);
      expect(postmortem.proposedFix.workflowStepReordering?.newOrder).toHaveLength(3);
      expect(postmortem.proposedFix.workflowStepReordering?.safetyCheck).toBeDefined();
    });
    
    it('should include stack trace in postmortem', async () => {
      const error = new Error('Test error');
      
      const postmortem = await analyzer.analyzeFailure(
        'workflow-1',
        'task-1',
        error
      );
      
      expect(postmortem.stackTrace).toBeDefined();
      expect(postmortem.stackTrace).toContain('Error');
    });
    
    it('should calculate confidence based on context', async () => {
      const error = new Error('Tool error');
      
      // Without context
      const postmortem1 = await analyzer.analyzeFailure('w1', 't1', error);
      
      // With rich context
      const postmortem2 = await analyzer.analyzeFailure('w1', 't1', error, {
        toolName: 'tool-a',
        stackTrace: error.stack,
        validationResults: [],
      });
      
      expect(postmortem2.confidence).toBeGreaterThan(postmortem1.confidence);
    });
    
    it('should handle missing context gracefully', async () => {
      const error = new Error('Generic error');
      
      const postmortem = await analyzer.analyzeFailure('w1', 't1', error);
      
      expect(postmortem).toBeDefined();
      expect(postmortem.proposedFix).toBeDefined();
      expect(postmortem.confidence).toBeGreaterThan(0);
    });
  });
});
