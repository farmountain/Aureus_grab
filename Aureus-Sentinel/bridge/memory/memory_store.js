/**
 * Memory Store
 * 
 * Persistent storage for execution history, context snapshots, and user interactions.
 * Enables historical risk assessment and context-aware decision making.
 * 
 * Features:
 * - Store execution history (intents, approvals, results)
 * - Store context snapshots with user state
 * - Query historical patterns
 * - Support context aggregation across sessions
 */

const fs = require('fs').promises;
const path = require('path');
const { randomUUID } = require('crypto');
const { getTelemetry } = require('../observability/tracing');
const { StructuredAuditLogger, AuditEventType, Severity } = require('../observability/audit_logger');

class MemoryStore {
  constructor(config = {}) {
    this.storePath = config.storePath || './.memory';
    this.maxMemoryEntries = config.maxMemoryEntries || 10000;
    this.initialized = false;
    this.auditLogger = config.auditLogger || null;
    this.telemetry = getTelemetry();
  }

  /**
   * Initialize memory store (create directory structure)
   */
  async init() {
    if (this.initialized) return;
    
    try {
      await fs.mkdir(this.storePath, { recursive: true });
      await fs.mkdir(path.join(this.storePath, 'contexts'), { recursive: true });
      await fs.mkdir(path.join(this.storePath, 'executions'), { recursive: true });
      await fs.mkdir(path.join(this.storePath, 'users'), { recursive: true });
      this.initialized = true;
      console.log(`[MemoryStore] Initialized at ${this.storePath}`);
    } catch (error) {
      console.error('[MemoryStore] Initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Store context snapshot
   * @param {object} context - ContextSnapshot object
   * @returns {Promise<string>} Context ID
   */
  async storeContext(context) {
    return await this.telemetry.traceMemoryStore('storeContext', async (span) => {
      await this.init();
      
      const contextId = context.contextId || randomUUID();
      const timestamp = new Date().toISOString();
      
      const entry = {
        contextId,
        timestamp,
        version: context.version || '1.0',
        type: 'ContextSnapshot',
        state: context.state || {},
        meta: {
          source: context.state?.channel || 'unknown',
          userId: context.state?.userId,
          storedAt: timestamp
        }
      };
      
      const filePath = path.join(
        this.storePath, 
        'contexts', 
        `${contextId.replace(/[^a-zA-Z0-9-]/g, '_')}.json`
      );
      
      await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf8');
      
      // Add span attributes
      span?.setAttribute('context.id', contextId);
      span?.setAttribute('context.userId', entry.meta.userId || 'unknown');
      span?.setAttribute('context.source', entry.meta.source);
      
      // Audit log
      if (this.auditLogger) {
        await this.auditLogger.log(Severity.INFO, AuditEventType.MEMORY_STORED, {
          message: 'Context snapshot stored',
          contextId,
          userId: entry.meta.userId,
          channel: entry.meta.source,
          type: 'context'
        });
      }
      
      console.log(`[MemoryStore] Stored context ${contextId}`);
      return contextId;
    });
  }

  /**
   * Store execution record
   * @param {object} execution - Execution record (intent, approval, result)
   * @returns {Promise<string>} Execution ID
   */
  async storeExecution(execution) {
    return await this.telemetry.traceMemoryStore('storeExecution', async (span) => {
      await this.init();
      
      const executionId = execution.executionId || randomUUID();
      const timestamp = new Date().toISOString();
      
      const entry = {
        executionId,
        timestamp,
        intent: execution.intent,
        approval: execution.approval,
        result: execution.result,
        contextId: execution.contextId,
        userId: execution.userId,
        channel: execution.channel,
        meta: {
          tool: execution.intent?.tool,
          risk: execution.intent?.risk,
          approved: execution.approval?.approved,
          storedAt: timestamp
        }
      };
      
      const filePath = path.join(
        this.storePath, 
        'executions', 
        `${executionId.replace(/[^a-zA-Z0-9-]/g, '_')}.json`
      );
      
      await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf8');
      
      // Also index by user
      if (execution.userId) {
        await this.indexByUser(execution.userId, executionId);
      }
      
      // Add span attributes
      span?.setAttribute('execution.id', executionId);
      span?.setAttribute('execution.userId', execution.userId || 'unknown');
      span?.setAttribute('execution.tool', entry.meta.tool || 'unknown');
      span?.setAttribute('execution.approved', entry.meta.approved);
      
      // Audit log
      if (this.auditLogger) {
        await this.auditLogger.log(Severity.INFO, AuditEventType.MEMORY_STORED, {
          message: 'Execution record stored',
          executionId,
          userId: execution.userId,
          tool: entry.meta.tool,
          risk: entry.meta.risk,
          approved: entry.meta.approved,
          type: 'execution'
        });
      }
      
      console.log(`[MemoryStore] Stored execution ${executionId}`);
      return executionId;
    });
  }

  /**
   * Index execution by user for quick lookup
   */
  async indexByUser(userId, executionId) {
    const userDir = path.join(this.storePath, 'users', userId.replace(/[^a-zA-Z0-9-]/g, '_'));
    await fs.mkdir(userDir, { recursive: true });
    
    const indexFile = path.join(userDir, 'executions.json');
    let index = [];
    
    try {
      const data = await fs.readFile(indexFile, 'utf8');
      index = JSON.parse(data);
    } catch (error) {
      // File doesn't exist, start new index
    }
    
    index.push({
      executionId,
      timestamp: new Date().toISOString()
    });
    
    // Keep only recent entries
    if (index.length > this.maxMemoryEntries) {
      index = index.slice(-this.maxMemoryEntries);
    }
    
    await fs.writeFile(indexFile, JSON.stringify(index, null, 2), 'utf8');
  }

  /**
   * Get context snapshot by ID
   * @param {string} contextId
   * @returns {Promise<object|null>}
   */
  async getContext(contextId) {
    await this.init();
    
    try {
      const filePath = path.join(
        this.storePath, 
        'contexts', 
        `${contextId.replace(/[^a-zA-Z0-9-]/g, '_')}.json`
      );
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get execution record by ID
   * @param {string} executionId
   * @returns {Promise<object|null>}
   */
  async getExecution(executionId) {
    await this.init();
    
    try {
      const filePath = path.join(
        this.storePath, 
        'executions', 
        `${executionId.replace(/[^a-zA-Z0-9-]/g, '_')}.json`
      );
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get user execution history
   * @param {string} userId
   * @param {object} options - { limit, offset }
   * @returns {Promise<Array>}
   */
  async getUserHistory(userId, options = {}) {
    await this.init();
    
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    
    try {
      const indexFile = path.join(
        this.storePath, 
        'users', 
        userId.replace(/[^a-zA-Z0-9-]/g, '_'), 
        'executions.json'
      );
      const data = await fs.readFile(indexFile, 'utf8');
      const index = JSON.parse(data);
      
      // Get recent entries
      const entries = index.slice(-limit - offset, -offset || undefined);
      
      // Load full execution records
      const executions = [];
      for (const entry of entries) {
        const execution = await this.getExecution(entry.executionId);
        if (execution) {
          executions.push(execution);
        }
      }
      
      return executions.reverse(); // Most recent first
    } catch (error) {
      return [];
    }
  }

  /**
   * Get statistical risk profile for user
   * @param {string} userId
   * @returns {Promise<object>}
   */
  async getUserRiskProfile(userId) {
    const history = await this.getUserHistory(userId, { limit: 100 });
    
    if (history.length === 0) {
      return {
        userId,
        totalExecutions: 0,
        approvalRate: 0,
        riskDistribution: { low: 0, medium: 0, high: 0 },
        commonTools: [],
        trustScore: 0.5 // Neutral for new users
      };
    }
    
    const stats = {
      total: history.length,
      approved: 0,
      byRisk: { low: 0, medium: 0, high: 0 },
      byTool: {}
    };
    
    for (const exec of history) {
      if (exec.approval?.approved) {
        stats.approved++;
      }
      
      const risk = exec.meta?.risk || 'unknown';
      if (stats.byRisk[risk] !== undefined) {
        stats.byRisk[risk]++;
      }
      
      const tool = exec.meta?.tool;
      if (tool) {
        stats.byTool[tool] = (stats.byTool[tool] || 0) + 1;
      }
    }
    
    // Calculate trust score (0-1)
    const approvalRate = stats.approved / stats.total;
    const lowRiskRate = stats.byRisk.low / stats.total;
    const trustScore = (approvalRate * 0.7) + (lowRiskRate * 0.3);
    
    // Get top tools
    const commonTools = Object.entries(stats.byTool)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tool, count]) => ({ tool, count }));
    
    return {
      userId,
      totalExecutions: stats.total,
      approvalRate,
      riskDistribution: stats.byRisk,
      commonTools,
      trustScore: Math.min(1, Math.max(0, trustScore))
    };
  }

  /**
   * Query executions with filters
   * @param {object} filters - { userId, channel, tool, risk, approved, since, until, limit }
   * @returns {Promise<Array>}
   */
  async queryExecutions(filters = {}) {
    await this.init();
    
    const limit = filters.limit || 100;
    const results = [];
    
    try {
      const executionsDir = path.join(this.storePath, 'executions');
      const files = await fs.readdir(executionsDir);
      
      for (const file of files) {
        if (results.length >= limit) break;
        if (!file.endsWith('.json')) continue;
        
        try {
          const filePath = path.join(executionsDir, file);
          const data = await fs.readFile(filePath, 'utf8');
          const execution = JSON.parse(data);
          
          // Apply filters
          if (filters.userId && execution.userId !== filters.userId) continue;
          if (filters.channel && execution.channel !== filters.channel) continue;
          if (filters.tool && execution.meta?.tool !== filters.tool) continue;
          if (filters.risk && execution.meta?.risk !== filters.risk) continue;
          if (filters.approved !== undefined && execution.approval?.approved !== filters.approved) continue;
          if (filters.since && new Date(execution.timestamp) < new Date(filters.since)) continue;
          if (filters.until && new Date(execution.timestamp) > new Date(filters.until)) continue;
          
          results.push(execution);
        } catch (error) {
          // Skip invalid files
        }
      }
      
      return results.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    } catch (error) {
      console.error('[MemoryStore] Query failed:', error.message);
      return [];
    }
  }

  /**
   * Get aggregate statistics
   * @returns {Promise<object>}
   */
  async getStats() {
    await this.init();
    
    try {
      const [contextFiles, executionFiles, userDirs] = await Promise.all([
        fs.readdir(path.join(this.storePath, 'contexts')),
        fs.readdir(path.join(this.storePath, 'executions')),
        fs.readdir(path.join(this.storePath, 'users'))
      ]);
      
      return {
        totalContexts: contextFiles.filter(f => f.endsWith('.json')).length,
        totalExecutions: executionFiles.filter(f => f.endsWith('.json')).length,
        totalUsers: userDirs.length,
        storePath: this.storePath
      };
    } catch (error) {
      return {
        totalContexts: 0,
        totalExecutions: 0,
        totalUsers: 0,
        storePath: this.storePath
      };
    }
  }
}

module.exports = { MemoryStore };
