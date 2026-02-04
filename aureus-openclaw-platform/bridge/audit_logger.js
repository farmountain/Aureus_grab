// Tamper-evident audit logger with hash chains for SIEM export
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class AuditLogger {
  constructor(storagePath) {
    this.storagePath = storagePath || path.join(__dirname, '..', '.audit');
    this.chainFile = path.join(this.storagePath, 'audit_chain.jsonl');
    this.lastHash = null;
    this.ensureStorage();
    this.loadLastHash();
  }

  ensureStorage() {
    if (!fs.existsSync(this.storagePath)) {
      fs.mkdirSync(this.storagePath, { recursive: true });
    }
  }

  loadLastHash() {
    if (fs.existsSync(this.chainFile)) {
      const lines = fs.readFileSync(this.chainFile, 'utf8').trim().split('\n').filter(l => l);
      if (lines.length > 0) {
        const lastEntry = JSON.parse(lines[lines.length - 1]);
        this.lastHash = lastEntry.hash;
      }
    }
  }

  hash(data) {
    return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
  }

  createAuditEntry(action, payload, metadata = {}) {
    const timestamp = new Date().toISOString();
    const sequence = this.getNextSequence();

    const entry = {
      sequence,
      timestamp,
      action,
      payload,
      metadata,
      previousHash: this.lastHash || '0000000000000000000000000000000000000000000000000000000000000000'
    };

    // Calculate hash of this entry
    const entryHash = this.hash(entry);
    entry.hash = entryHash;

    // Append to chain file
    this.appendToChain(entry);

    // Update last hash
    this.lastHash = entryHash;

    return entry;
  }

  appendToChain(entry) {
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(this.chainFile, line);
  }

  getNextSequence() {
    if (!fs.existsSync(this.chainFile)) return 1;
    
    const lines = fs.readFileSync(this.chainFile, 'utf8').trim().split('\n').filter(l => l);
    if (lines.length === 0) return 1;
    
    const lastEntry = JSON.parse(lines[lines.length - 1]);
    return lastEntry.sequence + 1;
  }

  logIntentReceived(intent, metadata = {}) {
    return this.createAuditEntry('intent.received', {
      intentId: intent.intentId,
      tool: intent.tool,
      riskLevel: intent.riskLevel,
      channelId: intent.channelId
    }, metadata);
  }

  logPlanGenerated(plan, metadata = {}) {
    return this.createAuditEntry('plan.generated', {
      planId: plan.planId,
      intentId: plan.intentId,
      actionsCount: plan.actions.length,
      riskLevel: plan.riskAssessment.overallRiskLevel,
      requiresHumanApproval: plan.requiresHumanApproval
    }, metadata);
  }

  logApprovalIssued(approval, metadata = {}) {
    return this.createAuditEntry('approval.issued', {
      approvalId: approval.approvalId,
      planId: approval.planId,
      approvedBy: approval.approvedBy,
      expiresAt: approval.expiresAt
    }, metadata);
  }

  logApprovalDenied(planId, reason, metadata = {}) {
    return this.createAuditEntry('approval.denied', {
      planId,
      reason
    }, metadata);
  }

  logExecutionStarted(reportId, approvalId, metadata = {}) {
    return this.createAuditEntry('execution.started', {
      reportId,
      approvalId
    }, metadata);
  }

  logExecutionCompleted(report, metadata = {}) {
    return this.createAuditEntry('execution.completed', {
      reportId: report.reportId,
      approvalId: report.approvalId,
      planId: report.planId,
      status: report.status
    }, metadata);
  }

  verifyChainIntegrity() {
    if (!fs.existsSync(this.chainFile)) {
      return { valid: true, message: 'No audit chain exists yet' };
    }

    const lines = fs.readFileSync(this.chainFile, 'utf8').trim().split('\n').filter(l => l);
    if (lines.length === 0) {
      return { valid: true, message: 'Empty audit chain' };
    }

    let previousHash = '0000000000000000000000000000000000000000000000000000000000000000';
    
    for (let i = 0; i < lines.length; i++) {
      const entry = JSON.parse(lines[i]);
      
      // Verify previous hash link
      if (entry.previousHash !== previousHash) {
        return {
          valid: false,
          message: `Chain broken at sequence ${entry.sequence}: previous hash mismatch`,
          sequence: entry.sequence
        };
      }

      // Verify entry hash
      const storedHash = entry.hash;
      const entryWithoutHash = { ...entry };
      delete entryWithoutHash.hash;
      const calculatedHash = this.hash(entryWithoutHash);

      if (storedHash !== calculatedHash) {
        return {
          valid: false,
          message: `Hash verification failed at sequence ${entry.sequence}: entry has been tampered`,
          sequence: entry.sequence
        };
      }

      previousHash = storedHash;
    }

    return {
      valid: true,
      message: `Chain verified: ${lines.length} entries`,
      entries: lines.length
    };
  }

  exportForSIEM(format = 'json') {
    if (!fs.existsSync(this.chainFile)) {
      return [];
    }

    const lines = fs.readFileSync(this.chainFile, 'utf8').trim().split('\n').filter(l => l);
    const entries = lines.map(line => JSON.parse(line));

    if (format === 'cef') {
      // Common Event Format for SIEM systems
      return entries.map(entry => this.toCEF(entry));
    }

    return entries;
  }

  toCEF(entry) {
    // CEF format: CEF:Version|Device Vendor|Device Product|Device Version|Signature ID|Name|Severity|Extension
    const severity = entry.action.includes('denied') ? 8 : 
                     entry.action.includes('approval') ? 6 : 4;
    
    const extensions = [
      `seq=${entry.sequence}`,
      `act=${entry.action}`,
      `end=${new Date(entry.timestamp).getTime()}`,
      `hash=${entry.hash}`,
      `prevHash=${entry.previousHash}`
    ];

    return `CEF:0|Aureus|OpenClaw Bridge|1.0|${entry.sequence}|${entry.action}|${severity}|${extensions.join(' ')}`;
  }

  clearAuditLog() {
    if (fs.existsSync(this.chainFile)) {
      fs.unlinkSync(this.chainFile);
    }
    this.lastHash = null;
  }
}

// Singleton instance
let auditLoggerInstance = null;

function getAuditLogger(storagePath) {
  if (!auditLoggerInstance) {
    auditLoggerInstance = new AuditLogger(storagePath);
  }
  return auditLoggerInstance;
}

module.exports = {
  AuditLogger,
  getAuditLogger
};
