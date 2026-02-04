import { describe, it, expect, beforeEach } from 'vitest';
import { AgentRegistry, AgentBlueprintRevision, InMemoryAgentRegistryStorage } from '../src/agent-registry';
import { AgentBlueprint } from '../src/agent-spec-schema';

describe('AgentRegistry', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry(new InMemoryAgentRegistryStorage());
  });

  const createMockBlueprint = (id: string, name: string, extraData?: Partial<AgentBlueprint>): AgentBlueprint => ({
    id,
    name,
    version: '1.0.0',
    description: `Test agent ${name}`,
    goal: 'Test goal for the agent',
    riskProfile: 'MEDIUM' as const,
    domain: 'general' as const,
    config: {
      prompt: 'Test prompt',
      systemPrompt: 'Test system prompt',
      temperature: 0.7,
      maxTokens: 2048,
    },
    tools: [],
    policies: [],
    workflows: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...extraData,
  });

  describe('registerRevision', () => {
    it('should register a new agent blueprint revision', async () => {
      const blueprint = createMockBlueprint('agent-1', 'Test Agent');
      
      const revision = await registry.registerRevision(
        blueprint,
        'test-user',
        'Initial version'
      );

      expect(revision).toBeDefined();
      expect(revision.agentId).toBe('agent-1');
      expect(revision.version).toBe('1.0.0');
      expect(revision.author).toBe('test-user');
      expect(revision.changeDescription).toBe('Initial version');
      expect(revision.previousVersion).toBeUndefined();
      expect(revision.diff).toBeUndefined();
    });

    it('should increment version for subsequent revisions', async () => {
      const blueprint1 = createMockBlueprint('agent-1', 'Test Agent');
      
      await registry.registerRevision(blueprint1, 'test-user', 'Initial version');
      
      const blueprint2 = createMockBlueprint('agent-1', 'Test Agent Updated', {
        description: 'Updated description',
      });
      
      const revision2 = await registry.registerRevision(
        blueprint2,
        'test-user',
        'Updated description'
      );

      expect(revision2.version).toBe('1.0.1');
      expect(revision2.previousVersion).toBe('1.0.0');
      expect(revision2.diff).toBeDefined();
    });

    it('should calculate diff between versions', async () => {
      const blueprint1 = createMockBlueprint('agent-1', 'Test Agent', {
        description: 'Original description',
      });
      
      await registry.registerRevision(blueprint1, 'test-user', 'Initial version');
      
      const blueprint2 = createMockBlueprint('agent-1', 'Test Agent Updated', {
        description: 'Updated description',
      });
      
      const revision2 = await registry.registerRevision(
        blueprint2,
        'test-user',
        'Updated description'
      );

      expect(revision2.diff).toBeDefined();
      expect(revision2.diff!.modified).toBeDefined();
      expect(revision2.diff!.modified['description']).toBeDefined();
      expect(revision2.diff!.modified['description'].old).toBe('Original description');
      expect(revision2.diff!.modified['description'].new).toBe('Updated description');
    });

    it('should persist to storage', async () => {
      const blueprint = createMockBlueprint('agent-1', 'Test Agent');
      
      await registry.registerRevision(blueprint, 'test-user', 'Initial version');

      const stored = await registry.getRevision('agent-1', '1.0.0');
      expect(stored).toBeDefined();
      
      const storedLatest = await registry.getRevision('agent-1', 'latest');
      expect(storedLatest).toBeDefined();
    });

    it('should support tags', async () => {
      const blueprint = createMockBlueprint('agent-1', 'Test Agent');
      
      const revision = await registry.registerRevision(
        blueprint,
        'test-user',
        'Initial version',
        ['production', 'stable']
      );

      expect(revision.tags).toEqual(['production', 'stable']);
    });
  });

  describe('getRevision', () => {
    it('should retrieve a specific revision', async () => {
      const blueprint = createMockBlueprint('agent-1', 'Test Agent');
      
      await registry.registerRevision(blueprint, 'test-user', 'Initial version');

      const retrieved = await registry.getRevision('agent-1', '1.0.0');
      
      expect(retrieved).toBeDefined();
      expect(retrieved!.version).toBe('1.0.0');
      expect(retrieved!.agentId).toBe('agent-1');
    });

    it('should retrieve latest revision', async () => {
      const blueprint1 = createMockBlueprint('agent-1', 'Test Agent');
      await registry.registerRevision(blueprint1, 'test-user', 'Initial version');
      
      const blueprint2 = createMockBlueprint('agent-1', 'Test Agent Updated');
      await registry.registerRevision(blueprint2, 'test-user', 'Second version');

      const latest = await registry.getRevision('agent-1', 'latest');
      
      expect(latest).toBeDefined();
      expect(latest!.version).toBe('1.0.1');
    });

    it('should return undefined for non-existent revision', async () => {
      const revision = await registry.getRevision('non-existent', '1.0.0');
      
      expect(revision).toBeUndefined();
    });
  });

  describe('listRevisions', () => {
    it('should list all revisions for an agent', async () => {
      const blueprint1 = createMockBlueprint('agent-1', 'Test Agent');
      await registry.registerRevision(blueprint1, 'test-user', 'Initial version');
      
      const blueprint2 = createMockBlueprint('agent-1', 'Test Agent Updated');
      await registry.registerRevision(blueprint2, 'test-user', 'Second version');
      
      const blueprint3 = createMockBlueprint('agent-1', 'Test Agent Final');
      await registry.registerRevision(blueprint3, 'test-user', 'Third version');

      const revisions = await registry.listRevisions('agent-1');
      
      expect(revisions).toHaveLength(3);
      // Should be sorted by timestamp descending (newest first)
      expect(revisions[0].version).toBe('1.0.2');
      expect(revisions[1].version).toBe('1.0.1');
      expect(revisions[2].version).toBe('1.0.0');
    });

    it('should support pagination', async () => {
      const blueprint1 = createMockBlueprint('agent-1', 'Test Agent');
      await registry.registerRevision(blueprint1, 'test-user', 'Initial version');
      
      const blueprint2 = createMockBlueprint('agent-1', 'Test Agent Updated');
      await registry.registerRevision(blueprint2, 'test-user', 'Second version');
      
      const blueprint3 = createMockBlueprint('agent-1', 'Test Agent Final');
      await registry.registerRevision(blueprint3, 'test-user', 'Third version');

      const page1 = await registry.listRevisions('agent-1', 2, 0);
      expect(page1).toHaveLength(2);
      expect(page1[0].version).toBe('1.0.2');
      expect(page1[1].version).toBe('1.0.1');
      
      const page2 = await registry.listRevisions('agent-1', 2, 2);
      expect(page2).toHaveLength(1);
      expect(page2[0].version).toBe('1.0.0');
    });

    it('should return empty array for non-existent agent', async () => {
      const revisions = await registry.listRevisions('non-existent');
      
      expect(revisions).toEqual([]);
    });
  });

  describe('listAgents', () => {
    it('should list all registered agents', async () => {
      const blueprint1 = createMockBlueprint('agent-1', 'Test Agent 1');
      await registry.registerRevision(blueprint1, 'test-user', 'Initial version');
      
      const blueprint2 = createMockBlueprint('agent-2', 'Test Agent 2');
      await registry.registerRevision(blueprint2, 'test-user', 'Initial version');

      const agents = await registry.listAgents();
      
      expect(agents).toHaveLength(2);
      expect(agents).toContain('agent-1');
      expect(agents).toContain('agent-2');
    });

    it('should return empty array when no agents registered', async () => {
      const agents = await registry.listAgents();
      
      expect(agents).toEqual([]);
    });
  });

  describe('queryRevisions', () => {
    beforeEach(async () => {
      const blueprint1 = createMockBlueprint('agent-1', 'Test Agent 1');
      await registry.registerRevision(blueprint1, 'user-1', 'Initial version', ['prod']);
      
      const blueprint2 = createMockBlueprint('agent-2', 'Test Agent 2');
      await registry.registerRevision(blueprint2, 'user-2', 'Initial version', ['dev']);
    });

    it('should filter by agentId', async () => {
      const results = await registry.queryRevisions({ agentId: 'agent-1' });
      
      expect(results).toHaveLength(1);
      expect(results[0].agentId).toBe('agent-1');
    });

    it('should filter by author', async () => {
      const results = await registry.queryRevisions({ author: 'user-1' });
      
      expect(results).toHaveLength(1);
      expect(results[0].author).toBe('user-1');
    });

    it('should filter by tags', async () => {
      const results = await registry.queryRevisions({ tags: ['prod'] });
      
      expect(results).toHaveLength(1);
      expect(results[0].tags).toContain('prod');
    });

    it('should support pagination in query', async () => {
      const blueprint3 = createMockBlueprint('agent-3', 'Test Agent 3');
      await registry.registerRevision(blueprint3, 'user-1', 'Initial version');

      const results = await registry.queryRevisions({ limit: 2, offset: 0 });
      
      expect(results).toHaveLength(2);
    });
  });

  describe('rollback', () => {
    it('should rollback to a previous version', async () => {
      const blueprint1 = createMockBlueprint('agent-1', 'Test Agent', {
        description: 'Version 1',
      });
      await registry.registerRevision(blueprint1, 'test-user', 'Initial version');
      
      const blueprint2 = createMockBlueprint('agent-1', 'Test Agent', {
        description: 'Version 2',
      });
      await registry.registerRevision(blueprint2, 'test-user', 'Second version');

      const rollbackRevision = await registry.rollback(
        'agent-1',
        '1.0.0',
        'test-user',
        'Reverting bad changes'
      );

      expect(rollbackRevision.version).toBe('1.0.2');
      expect(rollbackRevision.blueprint.description).toBe('Version 1');
      expect(rollbackRevision.changeDescription).toContain('Rollback to version 1.0.0');
      expect(rollbackRevision.tags).toContain('rollback');
    });

    it('should throw error for non-existent version', async () => {
      await expect(
        registry.rollback('agent-1', '99.0.0', 'test-user', 'Testing')
      ).rejects.toThrow('Revision not found');
    });
  });

  describe('compareVersions', () => {
    it('should compare two versions', async () => {
      const blueprint1 = createMockBlueprint('agent-1', 'Test Agent', {
        description: 'Version 1',
        tools: [],
      });
      await registry.registerRevision(blueprint1, 'test-user', 'Initial version');
      
      const blueprint2 = createMockBlueprint('agent-1', 'Test Agent', {
        description: 'Version 2',
        tools: [{
          toolId: 'tool-1',
          name: 'Test Tool',
          enabled: true,
        }],
      });
      await registry.registerRevision(blueprint2, 'test-user', 'Added tool');

      // Compare 1.0.1 (newer, versionA) to 1.0.0 (older, versionB)
      // This should show: description was modified FROM Version 1 TO Version 2
      const diff = await registry.compareVersions('agent-1', '1.0.1', '1.0.0');

      expect(diff).toBeDefined();
      expect(diff.modified).toBeDefined();
      expect(diff.modified['description']).toBeDefined();
      // old = versionB (1.0.0), new = versionA (1.0.1)
      expect(diff.modified['description'].old).toBe('Version 1');
      expect(diff.modified['description'].new).toBe('Version 2');
    });

    it('should throw error for non-existent versions', async () => {
      await expect(
        registry.compareVersions('agent-1', '1.0.0', '99.0.0')
      ).rejects.toThrow('Revision not found');
    });
  });

  describe('deleteAgent', () => {
    it('should delete all revisions for an agent', async () => {
      const blueprint1 = createMockBlueprint('agent-1', 'Test Agent');
      await registry.registerRevision(blueprint1, 'test-user', 'Initial version');
      
      const blueprint2 = createMockBlueprint('agent-1', 'Test Agent Updated');
      await registry.registerRevision(blueprint2, 'test-user', 'Second version');

      await registry.deleteAgent('agent-1');

      const revisions = await registry.listRevisions('agent-1');
      expect(revisions).toEqual([]);
      
      const agents = await registry.listAgents();
      expect(agents).not.toContain('agent-1');
    });
  });

  describe('version numbering', () => {
    it('should use semantic versioning', async () => {
      const blueprint = createMockBlueprint('agent-1', 'Test Agent');
      
      const rev1 = await registry.registerRevision(blueprint, 'test-user', 'v1');
      expect(rev1.version).toBe('1.0.0');
      
      const rev2 = await registry.registerRevision(blueprint, 'test-user', 'v2');
      expect(rev2.version).toBe('1.0.1');
      
      const rev3 = await registry.registerRevision(blueprint, 'test-user', 'v3');
      expect(rev3.version).toBe('1.0.2');
    });
  });

  describe('diff calculation', () => {
    it('should detect added fields', async () => {
      const blueprint1 = createMockBlueprint('agent-1', 'Test Agent', {
        tools: [],
      });
      await registry.registerRevision(blueprint1, 'test-user', 'Initial version');
      
      const blueprint2 = createMockBlueprint('agent-1', 'Test Agent', {
        tools: [{
          toolId: 'tool-1',
          name: 'New Tool',
          enabled: true,
        }],
        tags: ['new-tag'],
      });
      const rev2 = await registry.registerRevision(blueprint2, 'test-user', 'Added tool');

      expect(rev2.diff).toBeDefined();
      expect(Object.keys(rev2.diff!.added).length).toBeGreaterThan(0);
    });

    it('should detect modified fields', async () => {
      const blueprint1 = createMockBlueprint('agent-1', 'Test Agent', {
        description: 'Original',
      });
      await registry.registerRevision(blueprint1, 'test-user', 'Initial version');
      
      const blueprint2 = createMockBlueprint('agent-1', 'Test Agent', {
        description: 'Modified',
      });
      const rev2 = await registry.registerRevision(blueprint2, 'test-user', 'Modified description');

      expect(rev2.diff!.modified['description']).toBeDefined();
      expect(rev2.diff!.modified['description'].old).toBe('Original');
      expect(rev2.diff!.modified['description'].new).toBe('Modified');
    });

    it('should detect removed fields', async () => {
      const blueprint1 = createMockBlueprint('agent-1', 'Test Agent', {
        tags: ['tag-1', 'tag-2'],
      });
      await registry.registerRevision(blueprint1, 'test-user', 'Initial version');
      
      // Create blueprint without tags field
      const blueprint2: AgentBlueprint = {
        ...createMockBlueprint('agent-1', 'Test Agent'),
      };
      // Ensure tags is not present (Object.keys won't include it)
      const { tags, ...blueprint2WithoutTags } = blueprint2 as any;
      
      const rev2 = await registry.registerRevision(
        blueprint2WithoutTags as AgentBlueprint, 
        'test-user', 
        'Removed tags'
      );

      expect(rev2.diff).toBeDefined();
      // Tags field should be detected as removed
      expect(rev2.diff!.removed['tags']).toBeDefined();
    });
  });
});
