// Aureus decision engine stub with memory integration (Week 5)
// Enhanced with historical context and adaptive risk assessment
const { randomUUID } = require('crypto');
const { MemoryStore } = require('./memory/memory_store');
const { ContextAggregator } = require('./memory/context_aggregator');

// Initialize memory components
const memoryStore = new MemoryStore({ storePath: './.memory' });
const contextAggregator = new ContextAggregator(memoryStore);

async function generateActionPlan(intentEnvelope, enrichedContext) {
  const planId = randomUUID();
  const timestamp = new Date().toISOString();

  // Get contextual risk adjustment from history
  const userId = intentEnvelope.context?.state?.userId;
  const baseRisk = intentEnvelope.intent?.risk || intentEnvelope.riskLevel || 'medium';
  const tool = intentEnvelope.intent?.tool || intentEnvelope.tool;
  
  let riskAdjustment = null;
  if (userId && enrichedContext) {
    riskAdjustment = await contextAggregator.getContextualRiskAdjustment(userId, tool, baseRisk);
  }
  
  const finalRisk = riskAdjustment?.adjustedRisk || baseRisk;
  const riskMap = { low: 0.2, medium: 0.5, high: 0.8 };
  const riskScore = riskMap[finalRisk] || 0.5;

  // Check for suspicious patterns
  const suspiciousActivity = enrichedContext?.patterns?.suspiciousActivity || false;
  const adjustedRiskScore = suspiciousActivity ? Math.min(1.0, riskScore + 0.2) : riskScore;

  // Generate action based on tool and parameters
  const action = {
    actionId: randomUUID(),
    tool: tool,
    parameters: intentEnvelope.intent?.params || intentEnvelope.parameters,
    riskLevel: finalRisk,
    description: `Execute ${tool} with provided parameters`
  };

  // Build context-aware rationale
  let rationale = `Tool ${tool} assessed as ${finalRisk} risk`;
  if (riskAdjustment && riskAdjustment.adjustment !== 'none') {
    rationale += ` (${riskAdjustment.adjustment}d from ${baseRisk}: ${riskAdjustment.reason})`;
  }
  if (suspiciousActivity) {
    rationale += '. Suspicious activity detected in user history.';
  }
  
  // Determine if human approval is required
  const requiresHumanApproval = finalRisk === 'high' || suspiciousActivity;

  const plan = {
    version: '1.0',
    type: 'plan.proposed',
    planId,
    intentId: intentEnvelope.intentId || intentEnvelope.id,
    actions: [action],
    riskAssessment: {
      overallRiskScore: adjustedRiskScore,
      overallRiskLevel: finalRisk,
      baseRiskLevel: baseRisk,
      riskAdjustment: riskAdjustment,
      rationale,
      contextual: enrichedContext ? {
        trustScore: enrichedContext.riskProfile?.trustScore,
        totalExecutions: enrichedContext.history?.totalExecutions,
        suspiciousActivity: suspiciousActivity,
        patterns: enrichedContext.patterns?.indicators
      } : null
    },
    requiresHumanApproval,
    contextId: enrichedContext?.contextId,
    createdAt: timestamp
  };

  return plan;
}

function generateApproval(plan, signerKeys, opts = {}) {
  const approvalId = randomUUID();
  const now = new Date();
  const ttlMs = opts.ttlMs || 300000; // 5 minutes default
  const expires = new Date(now.getTime() + ttlMs);

  const approval = {
    version: '1.0',
    type: 'approval.execution',
    approvalId,
    planId: plan.planId,
    issuedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    publicKey: signerKeys.publicKey.toString('base64'),
    approvedBy: opts.humanApproved ? 'human_operator' : 'policy_engine',
    justification: opts.justification || `Automated approval for ${plan.riskAssessment.overallRiskLevel} risk plan`
  };

  // Add human approver details if applicable
  if (opts.humanApproved && opts.humanApprover) {
    approval.humanApprover = opts.humanApprover;
  }

  return approval;
}

function shouldAutoApprove(plan) {
  // Auto-approve only low and medium risk plans
  // High risk requires human approval
  return plan.riskAssessment.overallRiskLevel !== 'high';
}

async function processIntent(intentEnvelope, signerKeys, opts = {}) {
  // Generate enriched context from history
  const enrichedContext = await contextAggregator.generateContextSnapshot(intentEnvelope);
  
  // Store context snapshot
  await memoryStore.storeContext(enrichedContext);
  
  // Generate action plan with contextual risk assessment
  const plan = await generateActionPlan(intentEnvelope, enrichedContext);

  // Check if auto-approval is allowed
  if (!shouldAutoApprove(plan) && !opts.humanApproved) {
    // Store rejection in memory
    const userId = intentEnvelope.context?.state?.userId;
    if (userId) {
      await memoryStore.storeExecution({
        intent: intentEnvelope.intent,
        approval: { approved: false },
        result: { status: 'rejected', reason: 'Human approval required' },
        contextId: enrichedContext.contextId,
        userId: userId,
        channel: intentEnvelope.context?.state?.channel
      });
    }
    
    return {
      plan,
      approval: null,
      requiresHumanApproval: true,
      reason: 'High risk plan requires human approval',
      context: enrichedContext
    };
  }

  // Generate approval
  const approval = generateApproval(plan, signerKeys, opts);

  // Store execution in memory
  const userId = intentEnvelope.context?.state?.userId;
  if (userId) {
    await memoryStore.storeExecution({
      intent: intentEnvelope.intent,
      approval: { ...approval, approved: true },
      result: { status: 'approved' },
      contextId: enrichedContext.contextId,
      userId: userId,
      channel: intentEnvelope.context?.state?.channel
    });
  }

  return {
    plan,
    approval,
    requiresHumanApproval: false,
    context: enrichedContext
  };
}

module.exports = {
  generateActionPlan,
  generateApproval,
  shouldAutoApprove,
  processIntent,
  memoryStore,
  contextAggregator
};
