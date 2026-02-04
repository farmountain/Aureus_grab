import { AgentBlueprint } from './agent-spec-schema';

/**
 * Agent blueprint revision with metadata
 */
export interface AgentBlueprintRevision {
  agentId: string;
  version: string;
  blueprint: AgentBlueprint;
  author: string;
  timestamp: Date;
  changeDescription?: string;
  previousVersion?: string;
  diff?: AgentBlueprintDiff;
  tags?: string[];
}

/**
 * Diff between two agent blueprint versions
 */
export interface AgentBlueprintDiff {
  added: Record<string, unknown>;
  modified: Record<string, { old: unknown; new: unknown }>;
  removed: Record<string, unknown>;
}

/**
 * Agent registry query options
 */
export interface AgentRegistryQueryOptions {
  agentId?: string;
  author?: string;
  startDate?: Date;
  endDate?: Date;
  tags?: string[];
  limit?: number;
  offset?: number;
}

/**
 * Agent registry storage interface
 * Can be implemented with various backends (memory, file system, database)
 */
export interface AgentRegistryStorage {
  saveRevision(agentId: string, version: string, revision: AgentBlueprintRevision): Promise<void>;
  getRevision(agentId: string, version: string): Promise<AgentBlueprintRevision | undefined>;
  deleteRevision(agentId: string, version: string): Promise<void>;
  listVersions(agentId: string): Promise<string[]>;
  listAgents(): Promise<string[]>;
}

/**
 * In-memory implementation of agent registry storage
 */
export class InMemoryAgentRegistryStorage implements AgentRegistryStorage {
  private revisions: Map<string, Map<string, AgentBlueprintRevision>> = new Map();

  async saveRevision(agentId: string, version: string, revision: AgentBlueprintRevision): Promise<void> {
    if (!this.revisions.has(agentId)) {
      this.revisions.set(agentId, new Map());
    }
    this.revisions.get(agentId)!.set(version, revision);
  }

  async getRevision(agentId: string, version: string): Promise<AgentBlueprintRevision | undefined> {
    return this.revisions.get(agentId)?.get(version);
  }

  async deleteRevision(agentId: string, version: string): Promise<void> {
    this.revisions.get(agentId)?.delete(version);
    // If no more versions for this agent, remove the agent entry
    if (this.revisions.get(agentId)?.size === 0) {
      this.revisions.delete(agentId);
    }
  }

  async listVersions(agentId: string): Promise<string[]> {
    const versions = this.revisions.get(agentId);
    return versions ? Array.from(versions.keys()) : [];
  }

  async listAgents(): Promise<string[]> {
    return Array.from(this.revisions.keys());
  }
}

/**
 * Agent Registry
 * Manages agent blueprint versions with full history and rollback capabilities
 */
export class AgentRegistry {
  private storage: AgentRegistryStorage;

  constructor(storage?: AgentRegistryStorage) {
    this.storage = storage || new InMemoryAgentRegistryStorage();
  }

  /**
   * Register a new agent blueprint revision
   * @param blueprint - The agent blueprint to register
   * @param author - The author of this revision
   * @param changeDescription - Description of changes in this revision
   * @param tags - Optional tags for categorization
   * @returns The registered revision
   */
  async registerRevision(
    blueprint: AgentBlueprint,
    author: string,
    changeDescription?: string,
    tags?: string[]
  ): Promise<AgentBlueprintRevision> {
    const agentId = blueprint.id;
    
    // Get existing versions for this agent
    const existingVersions = await this.storage.listVersions(agentId);
    const existingRevisions: AgentBlueprintRevision[] = [];
    
    // Load all existing revisions
    for (const version of existingVersions) {
      const rev = await this.storage.getRevision(agentId, version);
      if (rev) {
        existingRevisions.push(rev);
      }
    }
    
    // Sort by version to find the latest
    existingRevisions.sort((a, b) => {
      const aVer = a.version.split('.').map(n => parseInt(n, 10));
      const bVer = b.version.split('.').map(n => parseInt(n, 10));
      for (let i = 0; i < 3; i++) {
        if (aVer[i] !== bVer[i]) {
          return aVer[i] - bVer[i];
        }
      }
      return 0;
    });
    
    // Determine previous version and generate new version number
    const previousVersion = existingRevisions.length > 0 
      ? existingRevisions[existingRevisions.length - 1].version 
      : undefined;
    
    const newVersion = this.generateNextVersion(previousVersion);
    
    // Calculate diff if there's a previous version
    let diff: AgentBlueprintDiff | undefined;
    if (existingRevisions.length > 0) {
      const previousBlueprint = existingRevisions[existingRevisions.length - 1].blueprint;
      diff = this.calculateDiff(previousBlueprint, blueprint);
    }
    
    // Create the revision
    const revision: AgentBlueprintRevision = {
      agentId,
      version: newVersion,
      blueprint: {
        ...blueprint,
        version: newVersion,
        updatedAt: new Date(),
      },
      author,
      timestamp: new Date(),
      changeDescription,
      previousVersion,
      diff,
      tags,
    };
    
    // Save to storage
    await this.storage.saveRevision(agentId, newVersion, revision);
    await this.storage.saveRevision(agentId, 'latest', revision);
    
    return revision;
  }

  /**
   * Get a specific revision by agent ID and version
   * @param agentId - The agent ID
   * @param version - The version number (or 'latest')
   * @returns The revision or undefined if not found
   */
  async getRevision(agentId: string, version: string): Promise<AgentBlueprintRevision | undefined> {
    return this.storage.getRevision(agentId, version);
  }

  /**
   * List all revisions for an agent
   * @param agentId - The agent ID
   * @param limit - Maximum number of revisions to return
   * @param offset - Offset for pagination
   * @returns Array of revisions sorted by version descending (newest first)
   */
  async listRevisions(
    agentId: string,
    limit?: number,
    offset: number = 0
  ): Promise<AgentBlueprintRevision[]> {
    const versions = await this.storage.listVersions(agentId);
    const revisions: AgentBlueprintRevision[] = [];
    
    for (const version of versions) {
      if (version === 'latest') continue; // Skip the 'latest' entry
      const rev = await this.storage.getRevision(agentId, version);
      if (rev) {
        revisions.push(rev);
      }
    }
    
    if (revisions.length === 0) {
      return [];
    }
    
    // Sort by semantic version descending (newest first)
    revisions.sort((a, b) => {
      const aVer = a.version.split('.').map(n => parseInt(n, 10));
      const bVer = b.version.split('.').map(n => parseInt(n, 10));
      // Compare major, minor, patch in order
      for (let i = 0; i < 3; i++) {
        if (bVer[i] !== aVer[i]) {
          return bVer[i] - aVer[i]; // Descending order
        }
      }
      return 0;
    });
    
    // Apply pagination
    const start = offset;
    const end = limit ? start + limit : revisions.length;
    
    return revisions.slice(start, end);
  }

  /**
   * List all agents in the registry
   * @returns Array of agent IDs
   */
  async listAgents(): Promise<string[]> {
    return this.storage.listAgents();
  }

  /**
   * Query revisions with filters
   * @param options - Query options
   * @returns Array of matching revisions
   */
  async queryRevisions(options: AgentRegistryQueryOptions): Promise<AgentBlueprintRevision[]> {
    let results: AgentBlueprintRevision[] = [];
    
    // If agentId is specified, only query that agent
    if (options.agentId) {
      const revisions = await this.listRevisions(options.agentId);
      results = revisions;
    } else {
      // Query all agents
      const agentIds = await this.listAgents();
      for (const agentId of agentIds) {
        const revisions = await this.listRevisions(agentId);
        results.push(...revisions);
      }
    }
    
    // Apply filters
    if (options.author) {
      results = results.filter(r => r.author === options.author);
    }
    
    if (options.startDate) {
      results = results.filter(r => r.timestamp >= options.startDate!);
    }
    
    if (options.endDate) {
      results = results.filter(r => r.timestamp <= options.endDate!);
    }
    
    if (options.tags && options.tags.length > 0) {
      results = results.filter(r => 
        r.tags && r.tags.some(tag => options.tags!.includes(tag))
      );
    }
    
    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    // Apply pagination
    const start = options.offset || 0;
    const end = options.limit ? start + options.limit : results.length;
    
    return results.slice(start, end);
  }

  /**
   * Rollback agent to a previous version
   * @param agentId - The agent ID
   * @param targetVersion - The version to rollback to
   * @param author - The author performing the rollback
   * @param reason - Reason for rollback
   * @returns The new revision created by the rollback
   */
  async rollback(
    agentId: string,
    targetVersion: string,
    author: string,
    reason?: string
  ): Promise<AgentBlueprintRevision> {
    // Get the target revision
    const targetRevision = await this.getRevision(agentId, targetVersion);
    if (!targetRevision) {
      throw new Error(`Revision not found: ${agentId} version ${targetVersion}`);
    }
    
    // Create a new revision with the target blueprint
    const changeDescription = reason 
      ? `Rollback to version ${targetVersion}: ${reason}`
      : `Rollback to version ${targetVersion}`;
    
    return this.registerRevision(
      targetRevision.blueprint,
      author,
      changeDescription,
      ['rollback']
    );
  }

  /**
   * Compare two versions of an agent blueprint
   * @param agentId - The agent ID
   * @param versionA - First version to compare (typically newer)
   * @param versionB - Second version to compare (typically older)
   * @returns The diff showing changes from versionB (old) to versionA (new)
   */
  async compareVersions(
    agentId: string,
    versionA: string,
    versionB: string
  ): Promise<AgentBlueprintDiff> {
    const revisionA = await this.getRevision(agentId, versionA);
    const revisionB = await this.getRevision(agentId, versionB);
    
    if (!revisionA) {
      throw new Error(`Revision not found: ${agentId} version ${versionA}`);
    }
    
    if (!revisionB) {
      throw new Error(`Revision not found: ${agentId} version ${versionB}`);
    }
    
    // Calculate diff from B (old) to A (new)
    return this.calculateDiff(revisionB.blueprint, revisionA.blueprint);
  }

  /**
   * Delete all revisions for an agent
   * @param agentId - The agent ID
   */
  async deleteAgent(agentId: string): Promise<void> {
    const versions = await this.storage.listVersions(agentId);
    
    for (const version of versions) {
      await this.storage.deleteRevision(agentId, version);
    }
  }

  /**
   * Generate the next version number
   * @param currentVersion - The current version (or undefined for first version)
   * @returns The next version number
   */
  private generateNextVersion(currentVersion?: string): string {
    if (!currentVersion) {
      return '1.0.0';
    }
    
    // Parse semantic version
    const parts = currentVersion.split('.').map(p => parseInt(p, 10));
    if (parts.length !== 3 || parts.some(p => isNaN(p))) {
      // If not a valid semantic version, log warning and start from 1.0.0
      console.warn(`Invalid semantic version: ${currentVersion}. Starting from 1.0.0`);
      return '1.0.0';
    }
    
    // Increment patch version
    parts[2]++;
    
    return parts.join('.');
  }

  /**
   * Calculate the diff between two agent blueprints
   * @param oldBlueprint - The old blueprint
   * @param newBlueprint - The new blueprint
   * @returns The diff
   */
  private calculateDiff(
    oldBlueprint: AgentBlueprint,
    newBlueprint: AgentBlueprint
  ): AgentBlueprintDiff {
    const added: Record<string, unknown> = {};
    const modified: Record<string, { old: unknown; new: unknown }> = {};
    const removed: Record<string, unknown> = {};
    
    // Helper to flatten nested objects for comparison
    const flatten = (obj: any, prefix = ''): Record<string, unknown> => {
      const result: Record<string, unknown> = {};
      
      for (const key in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
        
        const fullKey = prefix ? `${prefix}.${key}` : key;
        const value = obj[key];
        
        if (value === null || value === undefined) {
          result[fullKey] = value;
        } else if (Array.isArray(value)) {
          result[fullKey] = JSON.stringify(value);
        } else if (typeof value === 'object' && !(value instanceof Date)) {
          Object.assign(result, flatten(value, fullKey));
        } else {
          result[fullKey] = value;
        }
      }
      
      return result;
    };
    
    const oldFlat = flatten(oldBlueprint);
    const newFlat = flatten(newBlueprint);
    
    // Find added and modified fields
    for (const key in newFlat) {
      if (!(key in oldFlat)) {
        added[key] = newFlat[key];
      } else if (JSON.stringify(oldFlat[key]) !== JSON.stringify(newFlat[key])) {
        modified[key] = {
          old: oldFlat[key],
          new: newFlat[key],
        };
      }
    }
    
    // Find removed fields
    for (const key in oldFlat) {
      if (!(key in newFlat)) {
        removed[key] = oldFlat[key];
      }
    }
    
    return { added, modified, removed };
  }
}
