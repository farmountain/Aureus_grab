/**
 * Context Aggregator
 * 
 * Generates context snapshots by aggregating:
 * - Current user state
 * - Channel context (Telegram, Discord, etc.)
 * - Recent execution history
 * - User risk profile
 * 
 * Used by Aureus decision engine for history-aware risk assessment.
 */

class ContextAggregator {
  constructor(memoryStore) {
    this.memoryStore = memoryStore;
  }

  /**
   * Generate enriched context snapshot from intent and user history
   * @param {object} intentEnvelope - IntentEnvelope from channel adapter
   * @returns {Promise<object>} Enriched context snapshot
   */
  async generateContextSnapshot(intentEnvelope) {
    const baseContext = intentEnvelope.context || {};
    const userId = baseContext.state?.userId;
    const channel = baseContext.state?.channel;
    
    // Get user history and risk profile
    const [history, riskProfile] = await Promise.all([
      userId ? this.memoryStore.getUserHistory(userId, { limit: 10 }) : Promise.resolve([]),
      userId ? this.memoryStore.getUserRiskProfile(userId) : Promise.resolve(null)
    ]);
    
    // Build enriched context
    const enrichedContext = {
      version: '1.0',
      type: 'ContextSnapshot',
      contextId: baseContext.contextId || `ctx-${Date.now()}`,
      state: {
        ...baseContext.state,
        timestamp: new Date().toISOString()
      },
      history: {
        recentExecutions: history.slice(0, 5).map(exec => ({
          tool: exec.meta?.tool,
          risk: exec.meta?.risk,
          approved: exec.approval?.approved,
          timestamp: exec.timestamp
        })),
        totalExecutions: riskProfile?.totalExecutions || 0
      },
      riskProfile: riskProfile ? {
        trustScore: riskProfile.trustScore,
        approvalRate: riskProfile.approvalRate,
        riskDistribution: riskProfile.riskDistribution,
        commonTools: riskProfile.commonTools
      } : null,
      patterns: await this.detectPatterns(userId, channel, history),
      meta: {
        generatedAt: new Date().toISOString(),
        source: 'context_aggregator',
        historicalDataAvailable: history.length > 0
      }
    };
    
    return enrichedContext;
  }

  /**
   * Detect behavioral patterns from history
   * @param {string} userId
   * @param {string} channel
   * @param {Array} history
   * @returns {Promise<object>}
   */
  async detectPatterns(userId, channel, history) {
    if (!history || history.length === 0) {
      return {
        isNewUser: true,
        hasRecentHighRisk: false,
        hasRecentRejections: false,
        suspiciousActivity: false
      };
    }
    
    const recentHistory = history.slice(0, 20);
    
   // Calculate pattern indicators
    const highRiskCount = recentHistory.filter(e => e.meta?.risk === 'high').length;
    const rejectionCount = recentHistory.filter(e => !e.approval?.approved).length;
    const timeSpan = recentHistory.length > 1 
      ? new Date(recentHistory[0].timestamp) - new Date(recentHistory[recentHistory.length - 1].timestamp)
      : 0;
    
    // Check for suspicious patterns
    const rapidRequests = timeSpan > 0 && (recentHistory.length / (timeSpan / 1000 / 60)) > 10; // More than 10/min
    const highRejectionRate = rejectionCount / recentHistory.length > 0.5;
    const manyHighRisk = highRiskCount > 3;
    
    return {
      isNewUser: false,
      hasRecentHighRisk: highRiskCount > 0,
      hasRecentRejections: rejectionCount > 0,
      suspiciousActivity: rapidRequests || highRejectionRate || manyHighRisk,
      indicators: {
        rapidRequests,
        highRejectionRate,
        manyHighRisk,
        requestRate: timeSpan > 0 ? (recentHistory.length / (timeSpan / 1000 / 60)).toFixed(2) : 0
      }
    };
  }

  /**
   * Aggregate context from multiple sessions
   * @param {string} userId
   * @param {object} options - { timeWindow, channels }
   * @returns {Promise<object>}
   */
  async aggregateUserContext(userId, options = {}) {
    const timeWindow = options.timeWindow || 24 * 60 * 60 * 1000; // 24 hours
    const since = new Date(Date.now() - timeWindow).toISOString();
    
    const filters = {
      userId,
      since,
      limit: 200
    };
    
    if (options.channels) {
      // Would need to query per channel and merge
      // For now, get all and filter
    }
    
    const executions = await this.memoryStore.queryExecutions(filters);
    const riskProfile = await this.memoryStore.getUserRiskProfile(userId);
    
    // Group by channel
    const byChannel = {};
    for (const exec of executions) {
      const channel = exec.channel || 'unknown';
      if (!byChannel[channel]) {
        byChannel[channel] = [];
      }
      byChannel[channel].push(exec);
    }
    
    // Calculate session statistics
    const sessions = Object.entries(byChannel).map(([channel, execs]) => ({
      channel,
      count: execs.length,
      lastActivity: execs[0]?.timestamp,
      riskDistribution: {
        low: execs.filter(e => e.meta?.risk === 'low').length,
        medium: execs.filter(e => e.meta?.risk === 'medium').length,
        high: execs.filter(e => e.meta?.risk === 'high').length
      }
    }));
    
    return {
      userId,
      timeWindow: `${timeWindow / 1000 / 60 / 60}h`,
      totalExecutions: executions.length,
      sessions,
      riskProfile,
      aggregatedAt: new Date().toISOString()
    };
  }

  /**
   * Get contextual risk adjustment based on history
   * @param {string} userId
   * @param {string} tool
   * @param {string} baseRisk - low, medium, high
   * @returns {Promise<object>} Adjusted risk and reasoning
   */
  async getContextualRiskAdjustment(userId, tool, baseRisk) {
    const riskProfile = await this.memoryStore.getUserRiskProfile(userId);
    
    if (!riskProfile || riskProfile.totalExecutions === 0) {
      return {
        adjustedRisk: baseRisk,
        adjustment: 'none',
        reason: 'New user, no history available'
      };
    }
    
    const trustScore = riskProfile.trustScore;
    const hasUsedTool = riskProfile.commonTools.some(t => t.tool === tool);
    
    // Risk adjustment logic
    if (trustScore > 0.8 && hasUsedTool && baseRisk === 'medium') {
      return {
        adjustedRisk: 'low',
        adjustment: 'downgrade',
        reason: `High trust score (${trustScore.toFixed(2)}) and familiar tool`
      };
    }
    
    if (trustScore < 0.3) {
      const upgrade = {
        'low': 'medium',
        'medium': 'high',
        'high': 'high'
      };
      return {
        adjustedRisk: upgrade[baseRisk],
        adjustment: 'upgrade',
        reason: `Low trust score (${trustScore.toFixed(2)}) indicates risky behavior`
      };
    }
    
    return {
      adjustedRisk: baseRisk,
      adjustment: 'none',
      reason: `Trust score ${trustScore.toFixed(2)} within normal range`
    };
  }
}

module.exports = { ContextAggregator };
