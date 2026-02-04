/**
 * Memory API
 * 
 * RESTful API endpoints for querying memory store and context aggregation.
 * Used by dashboards, analytics, and debugging tools.
 */

const express = require('express');
const { MemoryStore } = require('./memory_store');
const { ContextAggregator } = require('./context_aggregator');

function createMemoryRouter(memoryStore, contextAggregator) {
  const router = express.Router();

  /**
   * GET /memory/stats
   * Get aggregate statistics
   */
  router.get('/stats', async (req, res) => {
    try {
      const stats = await memoryStore.getStats();
      res.json({ success: true, stats });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /memory/user/:userId/history
   * Get user execution history
   */
  router.get('/user/:userId/history', async (req, res) => {
    try {
      const { userId } = req.params;
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;
      
      const history = await memoryStore.getUserHistory(userId, { limit, offset });
      res.json({ success: true, userId, history, count: history.length });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /memory/user/:userId/profile
   * Get user risk profile
   */
  router.get('/user/:userId/profile', async (req, res) => {
    try {
      const { userId } = req.params;
      const profile = await memoryStore.getUserRiskProfile(userId);
      res.json({ success: true, profile });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /memory/user/:userId/context
   * Get aggregated user context
   */
  router.get('/user/:userId/context', async (req, res) => {
    try {
      const { userId } = req.params;
      const timeWindow = parseInt(req.query.timeWindow) || 24 * 60 * 60 * 1000;
      
      const context = await contextAggregator.aggregateUserContext(userId, { timeWindow });
      res.json({ success: true, context });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /memory/context/:contextId
   * Get specific context snapshot
   */
  router.get('/context/:contextId', async (req, res) => {
    try {
      const { contextId } = req.params;
      const context = await memoryStore.getContext(contextId);
      
      if (!context) {
        return res.status(404).json({ success: false, error: 'Context not found' });
      }
      
      res.json({ success: true, context });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /memory/execution/:executionId
   * Get specific execution record
   */
  router.get('/execution/:executionId', async (req, res) => {
    try {
      const { executionId } = req.params;
      const execution = await memoryStore.getExecution(executionId);
      
      if (!execution) {
        return res.status(404).json({ success: false, error: 'Execution not found' });
      }
      
      res.json({ success: true, execution });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * POST /memory/query
   * Query executions with filters
   * Body: { userId, channel, tool, risk, approved, since, until, limit }
   */
  router.post('/query', async (req, res) => {
    try {
      const filters = req.body;
      const executions = await memoryStore.queryExecutions(filters);
      res.json({ success: true, executions, count: executions.length });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * GET /memory/user/:userId/risk-adjustment/:tool/:baseRisk
   * Get contextual risk adjustment for user and tool
   */
  router.get('/user/:userId/risk-adjustment/:tool/:baseRisk', async (req, res) => {
    try {
      const { userId, tool, baseRisk } = req.params;
      const adjustment = await contextAggregator.getContextualRiskAdjustment(userId, tool, baseRisk);
      res.json({ success: true, adjustment });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * DELETE /memory/user/:userId
   * Clear user history (GDPR compliance)
   */
  router.delete('/user/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      // TODO: Implement user data deletion
      res.json({ success: true, message: 'User data deletion not yet implemented' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  return router;
}

module.exports = { createMemoryRouter };
