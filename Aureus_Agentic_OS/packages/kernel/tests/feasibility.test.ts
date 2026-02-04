import { describe, it, expect, beforeEach } from 'vitest';
import { FeasibilityChecker, ToolRegistry, ToolInfo } from '../src/feasibility';
import { TaskSpec } from '../src/types';
import { ConstraintEngine, HardConstraint, SoftConstraint, WorldState } from '@aureus/world-model';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('should register and retrieve tools', () => {
    const tool: ToolInfo = {
      name: 'test-tool',
      capabilities: ['http-client', 'json-processing'],
      available: true,
      riskLevel: 'LOW',
    };

    registry.registerTool(tool);
    const retrieved = registry.getTool('test-tool');
    
    expect(retrieved).toEqual(tool);
  });

  it('should check tool availability', () => {
    const tool: ToolInfo = {
      name: 'available-tool',
      capabilities: ['http-client'],
      available: true,
    };

    registry.registerTool(tool);
    
    expect(registry.isToolAvailable('available-tool')).toBe(true);
    expect(registry.isToolAvailable('nonexistent-tool')).toBe(false);
  });

  it('should unregister tools', () => {
    const tool: ToolInfo = {
      name: 'test-tool',
      capabilities: ['http-client'],
      available: true,
    };

    registry.registerTool(tool);
    expect(registry.isToolAvailable('test-tool')).toBe(true);
    
    registry.unregisterTool('test-tool');
    expect(registry.isToolAvailable('test-tool')).toBe(false);
  });

  it('should check tool capabilities', () => {
    const tool: ToolInfo = {
      name: 'multi-cap-tool',
      capabilities: ['http-client', 'json-processing', 'oauth2'],
      available: true,
    };

    registry.registerTool(tool);
    
    const result1 = registry.hasCapabilities('multi-cap-tool', ['http-client', 'json-processing']);
    expect(result1.hasAll).toBe(true);
    expect(result1.missing).toEqual([]);

    const result2 = registry.hasCapabilities('multi-cap-tool', ['http-client', 'websocket']);
    expect(result2.hasAll).toBe(false);
    expect(result2.missing).toEqual(['websocket']);
  });

  it('should get all available tools', () => {
    const tool1: ToolInfo = {
      name: 'tool1',
      capabilities: ['http-client'],
      available: true,
    };

    const tool2: ToolInfo = {
      name: 'tool2',
      capabilities: ['database'],
      available: false,
    };

    const tool3: ToolInfo = {
      name: 'tool3',
      capabilities: ['file-system'],
      available: true,
    };

    registry.registerTool(tool1);
    registry.registerTool(tool2);
    registry.registerTool(tool3);

    const available = registry.getAvailableTools();
    expect(available).toHaveLength(2);
    expect(available.map(t => t.name)).toEqual(['tool1', 'tool3']);
  });

  it('should clear all tools', () => {
    const tool: ToolInfo = {
      name: 'test-tool',
      capabilities: ['http-client'],
      available: true,
    };

    registry.registerTool(tool);
    expect(registry.isToolAvailable('test-tool')).toBe(true);
    
    registry.clear();
    expect(registry.isToolAvailable('test-tool')).toBe(false);
  });
});

describe('FeasibilityChecker', () => {
  let checker: FeasibilityChecker;
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
    checker = new FeasibilityChecker(registry);
  });

  describe('Basic Tool Availability Checks', () => {
    it('should pass feasibility for available tool', async () => {
      const tool: ToolInfo = {
        name: 'test-tool',
        capabilities: ['http-client'],
        available: true,
        riskLevel: 'LOW',
      };
      registry.registerTool(tool);

      const task: TaskSpec = {
        id: 'task1',
        name: 'Test Task',
        type: 'action',
        toolName: 'test-tool',
        riskTier: 'LOW',
      };

      const result = await checker.checkFeasibility(task);
      
      expect(result.feasible).toBe(true);
      expect(result.reasons).toHaveLength(0);
      expect(result.toolCapabilityCheck?.available).toBe(true);
    });

    it('should fail feasibility for unavailable tool', async () => {
      const task: TaskSpec = {
        id: 'task1',
        name: 'Test Task',
        type: 'action',
        toolName: 'nonexistent-tool',
      };

      const result = await checker.checkFeasibility(task);
      
      expect(result.feasible).toBe(false);
      expect(result.reasons).toContain("Tool 'nonexistent-tool' is not available or not registered");
      expect(result.toolCapabilityCheck?.available).toBe(false);
    });

    it('should fail feasibility for unavailable (registered but marked unavailable) tool', async () => {
      const tool: ToolInfo = {
        name: 'unavailable-tool',
        capabilities: ['http-client'],
        available: false,
      };
      registry.registerTool(tool);

      const task: TaskSpec = {
        id: 'task1',
        name: 'Test Task',
        type: 'action',
        toolName: 'unavailable-tool',
      };

      const result = await checker.checkFeasibility(task);
      
      expect(result.feasible).toBe(false);
      expect(result.reasons).toContain("Tool 'unavailable-tool' is not available or not registered");
    });
  });

  describe('Risk Tier Checks', () => {
    it('should pass feasibility when tool risk matches task risk', async () => {
      const tool: ToolInfo = {
        name: 'medium-risk-tool',
        capabilities: ['http-client'],
        available: true,
        riskLevel: 'MEDIUM',
      };
      registry.registerTool(tool);

      const task: TaskSpec = {
        id: 'task1',
        name: 'Test Task',
        type: 'action',
        toolName: 'medium-risk-tool',
        riskTier: 'MEDIUM',
      };

      const result = await checker.checkFeasibility(task);
      
      expect(result.feasible).toBe(true);
    });

    it('should fail feasibility when tool risk exceeds task risk', async () => {
      const tool: ToolInfo = {
        name: 'high-risk-tool',
        capabilities: ['database'],
        available: true,
        riskLevel: 'HIGH',
      };
      registry.registerTool(tool);

      const task: TaskSpec = {
        id: 'task1',
        name: 'Test Task',
        type: 'action',
        toolName: 'high-risk-tool',
        riskTier: 'LOW',
      };

      const result = await checker.checkFeasibility(task);
      
      expect(result.feasible).toBe(false);
      expect(result.reasons.some(r => r.includes('risk level'))).toBe(true);
    });

    it('should pass feasibility when tool risk is lower than task risk', async () => {
      const tool: ToolInfo = {
        name: 'low-risk-tool',
        capabilities: ['http-client'],
        available: true,
        riskLevel: 'LOW',
      };
      registry.registerTool(tool);

      const task: TaskSpec = {
        id: 'task1',
        name: 'Test Task',
        type: 'action',
        toolName: 'low-risk-tool',
        riskTier: 'HIGH',
      };

      const result = await checker.checkFeasibility(task);
      
      expect(result.feasible).toBe(true);
    });
  });

  describe('Allowed Tools Checks', () => {
    it('should pass feasibility when tool is in allowed list', async () => {
      const tool: ToolInfo = {
        name: 'allowed-tool',
        capabilities: ['http-client'],
        available: true,
      };
      registry.registerTool(tool);

      const task: TaskSpec = {
        id: 'task1',
        name: 'Test Task',
        type: 'action',
        toolName: 'allowed-tool',
        allowedTools: ['allowed-tool', 'another-tool'],
      };

      const result = await checker.checkFeasibility(task);
      
      expect(result.feasible).toBe(true);
    });

    it('should fail feasibility when tool is not in allowed list', async () => {
      const tool: ToolInfo = {
        name: 'restricted-tool',
        capabilities: ['http-client'],
        available: true,
      };
      registry.registerTool(tool);

      const task: TaskSpec = {
        id: 'task1',
        name: 'Test Task',
        type: 'action',
        toolName: 'restricted-tool',
        allowedTools: ['allowed-tool-1', 'allowed-tool-2'],
      };

      const result = await checker.checkFeasibility(task);
      
      expect(result.feasible).toBe(false);
      expect(result.reasons.some(r => r.includes('not in the list of allowed tools'))).toBe(true);
    });
  });

  describe('Constraint Validation', () => {
    it('should validate against hard constraints', async () => {
      const worldState: WorldState = {
        id: 'world-1',
        entities: new Map(),
        relationships: [],
        constraints: [],
        timestamp: new Date(),
      };

      const constraintEngine = new ConstraintEngine();
      const hardConstraint: HardConstraint = {
        id: 'constraint-1',
        description: 'Test hard constraint',
        category: 'policy',
        severity: 'hard',
        predicate: (state, action) => action !== 'forbidden-action',
        violationMessage: 'Action is forbidden',
      };
      constraintEngine.addHardConstraint(hardConstraint);

      checker = new FeasibilityChecker(registry, constraintEngine, worldState);

      const tool: ToolInfo = {
        name: 'test-tool',
        capabilities: ['http-client'],
        available: true,
      };
      registry.registerTool(tool);

      // Task with forbidden action
      const task1: TaskSpec = {
        id: 'task1',
        name: 'Forbidden Task',
        type: 'action',
        toolName: 'forbidden-action',
      };

      const result1 = await checker.checkFeasibility(task1);
      expect(result1.feasible).toBe(false);
      expect(result1.reasons.some(r => r.includes('Hard constraint violations'))).toBe(true);

      // Task with allowed action
      const task2: TaskSpec = {
        id: 'task2',
        name: 'Allowed Task',
        type: 'action',
        toolName: 'test-tool',
      };

      const result2 = await checker.checkFeasibility(task2);
      expect(result2.feasible).toBe(true);
    });

    it('should record soft constraint scores', async () => {
      const worldState: WorldState = {
        id: 'world-1',
        entities: new Map(),
        relationships: [],
        constraints: [],
        timestamp: new Date(),
      };

      const constraintEngine = new ConstraintEngine();
      const softConstraint: SoftConstraint = {
        id: 'constraint-1',
        description: 'Test soft constraint',
        category: 'cost',
        severity: 'soft',
        score: (state, action) => 0.7,
        weight: 1.0,
      };
      constraintEngine.addSoftConstraint(softConstraint);

      checker = new FeasibilityChecker(registry, constraintEngine, worldState);

      const tool: ToolInfo = {
        name: 'test-tool',
        capabilities: ['http-client'],
        available: true,
      };
      registry.registerTool(tool);

      const task: TaskSpec = {
        id: 'task1',
        name: 'Test Task',
        type: 'action',
        toolName: 'test-tool',
      };

      const result = await checker.checkFeasibility(task);
      
      expect(result.feasible).toBe(true);
      expect(result.confidenceScore).toBe(0.7);
      expect(result.constraintValidation?.satisfied).toBe(true);
    });

    it('should handle soft constraint violations with minimum score', async () => {
      const worldState: WorldState = {
        id: 'world-1',
        entities: new Map(),
        relationships: [],
        constraints: [],
        timestamp: new Date(),
      };

      const constraintEngine = new ConstraintEngine();
      const softConstraint: SoftConstraint = {
        id: 'constraint-1',
        description: 'Test soft constraint with min score',
        category: 'cost',
        severity: 'soft',
        score: (state, action) => 0.3, // Low score
        weight: 1.0,
        minScore: 0.5, // Minimum threshold
      };
      constraintEngine.addSoftConstraint(softConstraint);

      checker = new FeasibilityChecker(registry, constraintEngine, worldState);

      const tool: ToolInfo = {
        name: 'test-tool',
        capabilities: ['http-client'],
        available: true,
      };
      registry.registerTool(tool);

      const task: TaskSpec = {
        id: 'task1',
        name: 'Test Task',
        type: 'action',
        toolName: 'test-tool',
      };

      const result = await checker.checkFeasibility(task);
      
      // Soft constraint violations don't block execution by default
      // They're recorded but task remains feasible
      expect(result.feasible).toBe(true);
      expect(result.confidenceScore).toBe(0.3);
      expect(result.constraintValidation?.violations.length).toBeGreaterThan(0);
    });
  });

  describe('Input Validation', () => {
    it('should fail feasibility for null/undefined inputs', async () => {
      const tool: ToolInfo = {
        name: 'test-tool',
        capabilities: ['http-client'],
        available: true,
      };
      registry.registerTool(tool);

      const task: TaskSpec = {
        id: 'task1',
        name: 'Test Task',
        type: 'action',
        toolName: 'test-tool',
        inputs: {
          param1: 'value1',
          param2: null,
          param3: undefined,
        },
      };

      const result = await checker.checkFeasibility(task);
      
      expect(result.feasible).toBe(false);
      expect(result.reasons.some(r => r.includes('null or undefined'))).toBe(true);
    });

    it('should pass feasibility for valid inputs', async () => {
      const tool: ToolInfo = {
        name: 'test-tool',
        capabilities: ['http-client'],
        available: true,
      };
      registry.registerTool(tool);

      const task: TaskSpec = {
        id: 'task1',
        name: 'Test Task',
        type: 'action',
        toolName: 'test-tool',
        inputs: {
          param1: 'value1',
          param2: 42,
          param3: true,
        },
      };

      const result = await checker.checkFeasibility(task);
      
      expect(result.feasible).toBe(true);
    });
  });

  describe('Required Permissions', () => {
    it('should validate required permissions format', async () => {
      const tool: ToolInfo = {
        name: 'test-tool',
        capabilities: ['http-client'],
        available: true,
      };
      registry.registerTool(tool);

      const task: TaskSpec = {
        id: 'task1',
        name: 'Test Task',
        type: 'action',
        toolName: 'test-tool',
        requiredPermissions: [
          { action: 'read', resource: 'database' },
          { action: 'write', resource: 'file' },
        ],
      };

      const result = await checker.checkFeasibility(task);
      
      expect(result.feasible).toBe(true);
    });
  });

  describe('Batch Feasibility Checks', () => {
    it('should check feasibility for multiple tasks', async () => {
      const tool1: ToolInfo = {
        name: 'tool1',
        capabilities: ['http-client'],
        available: true,
      };
      const tool2: ToolInfo = {
        name: 'tool2',
        capabilities: ['database'],
        available: false,
      };
      registry.registerTool(tool1);
      registry.registerTool(tool2);

      const tasks: TaskSpec[] = [
        {
          id: 'task1',
          name: 'Task 1',
          type: 'action',
          toolName: 'tool1',
        },
        {
          id: 'task2',
          name: 'Task 2',
          type: 'action',
          toolName: 'tool2',
        },
        {
          id: 'task3',
          name: 'Task 3',
          type: 'action',
          toolName: 'nonexistent',
        },
      ];

      const results = await checker.checkBatchFeasibility(tasks);
      
      expect(results.size).toBe(3);
      expect(results.get('task1')?.feasible).toBe(true);
      expect(results.get('task2')?.feasible).toBe(false);
      expect(results.get('task3')?.feasible).toBe(false);
    });
  });

  describe('Helper Methods', () => {
    it('should check if action is allowed', () => {
      const worldState: WorldState = {
        id: 'world-1',
        entities: new Map(),
        relationships: [],
        constraints: [],
        timestamp: new Date(),
      };

      const constraintEngine = new ConstraintEngine();
      const hardConstraint: HardConstraint = {
        id: 'constraint-1',
        description: 'Test constraint',
        category: 'policy',
        severity: 'hard',
        predicate: (state, action) => action !== 'forbidden',
      };
      constraintEngine.addHardConstraint(hardConstraint);

      checker = new FeasibilityChecker(registry, constraintEngine, worldState);

      expect(checker.isActionAllowed('allowed-action')).toBe(true);
      expect(checker.isActionAllowed('forbidden')).toBe(false);
    });

    it('should get action score', () => {
      const worldState: WorldState = {
        id: 'world-1',
        entities: new Map(),
        relationships: [],
        constraints: [],
        timestamp: new Date(),
      };

      const constraintEngine = new ConstraintEngine();
      const softConstraint: SoftConstraint = {
        id: 'constraint-1',
        description: 'Test constraint',
        category: 'cost',
        severity: 'soft',
        score: (state, action) => action === 'high-score' ? 0.9 : 0.3,
      };
      constraintEngine.addSoftConstraint(softConstraint);

      checker = new FeasibilityChecker(registry, constraintEngine, worldState);

      expect(checker.getActionScore('high-score')).toBe(0.9);
      expect(checker.getActionScore('low-score')).toBe(0.3);
    });

    it('should return default values when no constraint engine configured', () => {
      const checkerWithoutConstraints = new FeasibilityChecker(registry);

      expect(checkerWithoutConstraints.isActionAllowed('any-action')).toBe(true);
      expect(checkerWithoutConstraints.getActionScore('any-action')).toBe(1.0);
    });
  });

  describe('Metadata', () => {
    it('should include metadata in feasibility check result', async () => {
      const tool: ToolInfo = {
        name: 'test-tool',
        capabilities: ['http-client'],
        available: true,
      };
      registry.registerTool(tool);

      const task: TaskSpec = {
        id: 'task1',
        name: 'Test Task',
        type: 'action',
        toolName: 'test-tool',
      };

      const result = await checker.checkFeasibility(task);
      
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.taskId).toBe('task1');
      expect(result.metadata?.taskName).toBe('Test Task');
      expect(result.metadata?.toolName).toBe('test-tool');
      expect(result.metadata?.checkedAt).toBeDefined();
    });
  });
});
