// Replay harness for event verification and testing
const { getEventStore } = require('./event_store');
const { processIntent } = require('./aureus_stub');
const { generateKeypair } = require('./signer');

class ReplayHarness {
  constructor(eventStore) {
    this.eventStore = eventStore || getEventStore();
    this.results = [];
  }

  async replayIntent(intentEvent, opts = {}) {
    const { payload: intentEnvelope } = intentEvent;
    
    // Use provided keys or generate ephemeral ones
    const keys = opts.keys || generateKeypair();
    
    // Re-process the intent
    const result = await processIntent(intentEnvelope, keys, opts);
    
    return {
      originalEventId: intentEvent.eventId,
      originalTimestamp: intentEvent.timestamp,
      replayTimestamp: new Date().toISOString(),
      intentId: intentEnvelope.intentId,
      plan: result.plan,
      approval: result.approval,
      requiresHumanApproval: result.requiresHumanApproval
    };
  }

  async replayAllIntents(opts = {}) {
    const intentEvents = this.eventStore.getEventsByType('intent.received');
    const results = [];

    for (const event of intentEvents) {
      try {
        const result = await this.replayIntent(event, opts);
        results.push({
          success: true,
          ...result
        });
      } catch (err) {
        results.push({
          success: false,
          originalEventId: event.eventId,
          error: err.message
        });
      }
    }

    this.results = results;
    return results;
  }

  async replayTimeRange(startTime, endTime, opts = {}) {
    const events = this.eventStore.getEventsByTimeRange(startTime, endTime)
      .filter(e => e.eventType === 'intent.received');
    
    const results = [];
    for (const event of events) {
      try {
        const result = await this.replayIntent(event, opts);
        results.push({
          success: true,
          ...result
        });
      } catch (err) {
        results.push({
          success: false,
          originalEventId: event.eventId,
          error: err.message
        });
      }
    }

    return results;
  }

  compareWithOriginal(replayResult) {
    // Find original plan and approval events
    const originalPlan = this.eventStore.getAllEvents()
      .find(e => e.eventType === 'plan.generated' && e.metadata.intentId === replayResult.intentId);
    
    const originalApproval = originalPlan 
      ? this.eventStore.getAllEvents()
          .find(e => e.eventType === 'approval.issued' && e.metadata.planId === originalPlan.payload.planId)
      : null;

    const comparison = {
      intentId: replayResult.intentId,
      planMatch: null,
      approvalMatch: null,
      differences: []
    };

    if (originalPlan) {
      // Compare risk assessment
      const originalRisk = originalPlan.payload.riskAssessment.overallRiskLevel;
      const replayRisk = replayResult.plan.riskAssessment.overallRiskLevel;
      
      comparison.planMatch = originalRisk === replayRisk;
      if (!comparison.planMatch) {
        comparison.differences.push(`Risk level changed: ${originalRisk} -> ${replayRisk}`);
      }
    }

    if (originalApproval && replayResult.approval) {
      comparison.approvalMatch = originalApproval.payload.approvedBy === replayResult.approval.approvedBy;
      if (!comparison.approvalMatch) {
        comparison.differences.push('Approval authority changed');
      }
    }

    return comparison;
  }

  generateReport() {
    const total = this.results.length;
    const successful = this.results.filter(r => r.success).length;
    const failed = total - successful;

    return {
      summary: {
        total,
        successful,
        failed,
        successRate: total > 0 ? (successful / total * 100).toFixed(2) + '%' : 'N/A'
      },
      results: this.results
    };
  }
}

module.exports = { ReplayHarness };
