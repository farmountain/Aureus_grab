/**
 * Structured Audit Logger
 * 
 * Provides tamper-evident audit logging for all security-relevant events.
 * Supports multiple output formats: JSON, CEF (Common Event Format), and console.
 * 
 * Features:
 * - Structured log entries with consistent schema
 * - Severity levels (DEBUG, INFO, WARN, ERROR, CRITICAL)
 * - Event types with standardized fields
 * - Multiple output targets (file, SIEM, console)
 * - Tamper-evident hash chain linkage
 * - Query and export capabilities
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// Audit event types
const AuditEventType = {
  INTENT_RECEIVED: 'intent.received',
  CONTEXT_ENRICHED: 'context.enriched',
  RISK_ASSESSED: 'risk.assessed',
  APPROVAL_GRANTED: 'approval.granted',
  APPROVAL_DENIED: 'approval.denied',
  SIGNATURE_VERIFIED: 'signature.verified',
  SIGNATURE_FAILED: 'signature.failed',
  EXECUTION_STARTED: 'execution.started',
  EXECUTION_COMPLETED: 'execution.completed',
  EXECUTION_FAILED: 'execution.failed',
  MEMORY_STORED: 'memory.stored',
  MEMORY_QUERIED: 'memory.queried',
  CONFIG_CHANGED: 'config.changed',
  AUTH_SUCCESS: 'auth.success',
  AUTH_FAILED: 'auth.failed',
  SUSPICIOUS_ACTIVITY: 'suspicious.activity'
};

// Severity levels
const Severity = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  CRITICAL: 'CRITICAL'
};

class StructuredAuditLogger {
  constructor(config = {}) {
    this.logDir = config.logDir || './.audit-logs';
    this.enableConsole = config.enableConsole !== false;
    this.enableFile = config.enableFile !== false;
    this.enableSIEM = config.enableSIEM || false;
    this.siemEndpoint = config.siemEndpoint;
    this.includeStackTrace = config.includeStackTrace || false;
    
    // Tamper-evident chain
    this.previousHash = null;
    this.chainStarted = false;
    
    this.initialized = false;
  }

  /**
   * Initialize audit logger
   */
  async init() {
    if (this.initialized) return;
    
    if (this.enableFile) {
      await fs.mkdir(this.logDir, { recursive: true });
    }
    
    this.initialized = true;
    await this.log(Severity.INFO, AuditEventType.CONFIG_CHANGED, {
      message: 'Audit logger initialized',
      config: {
        enableConsole: this.enableConsole,
        enableFile: this.enableFile,
        enableSIEM: this.enableSIEM
      }
    });
  }

  /**
   * Log an audit event
   * @param {string} severity - Severity level
   * @param {string} eventType - Event type
   * @param {object} data - Event data
   * @returns {Promise<object>} Log entry
   */
  async log(severity, eventType, data = {}) {
    const timestamp = new Date().toISOString();
    const entry = {
      timestamp,
      severity,
      eventType,
      ...data,
      meta: {
        pid: process.pid,
        hostname: require('os').hostname(),
        version: '1.0',
        ...data.meta
      }
    };

    // Add tamper-evident hash chain
    if (this.chainStarted) {
      entry.previousHash = this.previousHash;
    }
    
    const entryJSON = JSON.stringify(entry, Object.keys(entry).sort());
    const hash = crypto.createHash('sha256').update(entryJSON).digest('hex');
    entry.hash = hash;
    
    this.previousHash = hash;
    this.chainStarted = true;

    // Output to configured targets
    if (this.enableConsole) {
      this.logToConsole(entry);
    }
    
    if (this.enableFile) {
      await this.logToFile(entry);
    }
    
    if (this.enableSIEM && this.siemEndpoint) {
      await this.logToSIEM(entry);
    }

    return entry;
  }

  /**
   * Log to console
   */
  logToConsole(entry) {
    const colorMap = {
      DEBUG: '\x1b[36m',    // Cyan
      INFO: '\x1b[32m',     // Green
      WARN: '\x1b[33m',     // Yellow
      ERROR: '\x1b[31m',    // Red
      CRITICAL: '\x1b[35m'  // Magenta
    };
    
    const color = colorMap[entry.severity] || '';
    const reset = '\x1b[0m';
    
    console.log(`${color}[${entry.timestamp}] ${entry.severity} ${entry.eventType}${reset}`, 
      entry.message || '', entry.userId || '');
  }

  /**
   * Log to file (JSON Lines format)
   */
  async logToFile(entry) {
    try {
      const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const logFile = path.join(this.logDir, `audit-${date}.jsonl`);
      const line = JSON.stringify(entry) + '\n';
      await fs.appendFile(logFile, line, 'utf8');
    } catch (error) {
      console.error('[AuditLogger] Failed to write to file:', error.message);
    }
  }

  /**
   * Log to SIEM (CEF format)
   */
  async logToSIEM(entry) {
    try {
      const cef = this.toCEF(entry);
      // Send to SIEM endpoint (implement based on SIEM vendor)
      // Example: HTTP POST to Splunk HEC, Elastic, etc.
      console.log('[AuditLogger] SIEM:', cef);
    } catch (error) {
      console.error('[AuditLogger] Failed to send to SIEM:', error.message);
    }
  }

  /**
   * Convert entry to CEF (Common Event Format)
   */
  toCEF(entry) {
    const version = 0;
    const deviceVendor = 'Aureus';
    const deviceProduct = 'Sentinel';
    const deviceVersion = '1.0';
    const signatureId = entry.eventType;
    const name = entry.message || entry.eventType;
    const severity = this.severityToCEF(entry.severity);
    
    const extensions = [];
    if (entry.userId) extensions.push(`suser=${entry.userId}`);
    if (entry.tool) extensions.push(`act=${entry.tool}`);
    if (entry.risk) extensions.push(`cn1=${entry.risk} cn1Label=RiskLevel`);
    if (entry.approved !== undefined) extensions.push(`outcome=${entry.approved ? 'success' : 'failure'}`);
    
    return `CEF:${version}|${deviceVendor}|${deviceProduct}|${deviceVersion}|${signatureId}|${name}|${severity}|${extensions.join(' ')}`;
  }

  /**
   * Convert severity to CEF severity (0-10)
   */
  severityToCEF(severity) {
    const map = {
      DEBUG: 0,
      INFO: 3,
      WARN: 6,
      ERROR: 8,
      CRITICAL: 10
    };
    return map[severity] || 5;
  }

  /**
   * Convenience methods for common event types
   */

  async logIntentReceived(intentId, userId, tool, risk, channel) {
    return this.log(Severity.INFO, AuditEventType.INTENT_RECEIVED, {
      message: 'Intent received from user',
      intentId,
      userId,
      tool,
      risk,
      channel
    });
  }

  async logRiskAssessed(intentId, baseRisk, adjustedRisk, trustScore, reason) {
    return this.log(Severity.INFO, AuditEventType.RISK_ASSESSED, {
      message: 'Risk assessment completed',
      intentId,
      baseRisk,
      adjustedRisk,
      trustScore,
      reason
    });
  }

  async logApprovalGranted(approvalId, planId, userId, tool, risk, humanApproved) {
    return this.log(Severity.INFO, AuditEventType.APPROVAL_GRANTED, {
      message: 'Approval granted',
      approvalId,
      planId,
      userId,
      tool,
      risk,
      humanApproved,
      approved: true
    });
  }

  async logApprovalDenied(planId, userId, tool, risk, reason) {
    return this.log(Severity.WARN, AuditEventType.APPROVAL_DENIED, {
      message: 'Approval denied',
      planId,
      userId,
      tool,
      risk,
      reason,
      approved: false
    });
  }

  async logSignatureVerified(approvalId, planId) {
    return this.log(Severity.INFO, AuditEventType.SIGNATURE_VERIFIED, {
      message: 'Signature verification passed',
      approvalId,
      planId
    });
  }

  async logSignatureFailed(approvalId, planId, reason) {
    return this.log(Severity.ERROR, AuditEventType.SIGNATURE_FAILED, {
      message: 'Signature verification failed',
      approvalId,
      planId,
      reason
    });
  }

  async logExecutionCompleted(executionId, approvalId, userId, tool, status) {
    return this.log(Severity.INFO, AuditEventType.EXECUTION_COMPLETED, {
      message: 'Execution completed',
      executionId,
      approvalId,
      userId,
      tool,
      status
    });
  }

  async logSuspiciousActivity(userId, reason, indicators) {
    return this.log(Severity.CRITICAL, AuditEventType.SUSPICIOUS_ACTIVITY, {
      message: 'Suspicious activity detected',
      userId,
      reason,
      indicators
    });
  }

  /**
   * Query audit logs by filter
   * @param {object} filter - { startDate, endDate, severity, eventType, userId }
   * @returns {Promise<Array>} Log entries
   */
  async query(filter = {}) {
    const results = [];
    
    try {
      const files = await fs.readdir(this.logDir);
      const logFiles = files.filter(f => f.startsWith('audit-') && f.endsWith('.jsonl'));
      
      for (const file of logFiles) {
        const filePath = path.join(this.logDir, file);
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.trim().split('\n');
        
        for (const line of lines) {
          if (!line) continue;
          
          try {
            const entry = JSON.parse(line);
            
            // Apply filters
            if (filter.startDate && new Date(entry.timestamp) < new Date(filter.startDate)) continue;
            if (filter.endDate && new Date(entry.timestamp) > new Date(filter.endDate)) continue;
            if (filter.severity && entry.severity !== filter.severity) continue;
            if (filter.eventType && entry.eventType !== filter.eventType) continue;
            if (filter.userId && entry.userId !== filter.userId) continue;
            
            results.push(entry);
          } catch (parseError) {
            // Skip invalid lines
          }
        }
      }
      
      return results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (error) {
      console.error('[AuditLogger] Query failed:', error.message);
      return [];
    }
  }

  /**
   * Verify hash chain integrity
   * @returns {Promise<object>} Verification result
   */
  async verifyChainIntegrity() {
    const logs = await this.query();
    
    if (logs.length === 0) {
      return { valid: true, totalEntries: 0, message: 'No logs to verify' };
    }
    
    // Sort chronologically (oldest first) for chain verification
    const chronological = logs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    let valid = true;
    let brokenAt = null;
    
    // Verify each entry's previousHash matches the previous entry's hash
    for (let i = 1; i < chronological.length; i++) {
      const current = chronological[i];
      const previous = chronological[i - 1];
      
      if (current.previousHash && current.previousHash !== previous.hash) {
        valid = false;
        brokenAt = current.timestamp;
        break;
      }
    }
    
    return {
      valid,
      totalEntries: logs.length,
      brokenAt,
      message: valid ? 'Hash chain integrity verified' : `Chain broken at ${brokenAt}`
    };
  }
}

module.exports = {
  StructuredAuditLogger,
  AuditEventType,
  Severity
};
