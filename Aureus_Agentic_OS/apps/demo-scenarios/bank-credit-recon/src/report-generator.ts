/**
 * Report generators for reconciliation outputs
 */

import * as fs from 'fs';
import * as path from 'path';
import { BatchCheckResult } from './batch-checker';
import { ValidationResult } from './mapping-validator';
import { TableSchema } from './schema-extractor';
import { AuditLogEntry } from '@aureus/memory-hipcortex';

export interface ReliabilityMetrics {
  reconciliation_accuracy: number;
  total_records_processed: number;
  match_rate: number;
  error_rate: number;
  execution_time_ms: number;
  timestamp: string;
  crv_validations_passed: number;
  crv_validations_failed: number;
  policy_checks_passed: number;
  policy_checks_failed: number;
}

export class ReportGenerator {
  private outputDir: string;

  constructor(outputDir: string) {
    this.outputDir = outputDir;
    
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  }

  /**
   * Generate reconciliation report
   */
  generateReconciliationReport(
    sourceSchema: TableSchema,
    targetSchema: TableSchema,
    validationResult: ValidationResult,
    batchResult: BatchCheckResult
  ): void {
    const reportPath = path.join(this.outputDir, 'recon_report.md');
    
    let report = '# Bank Credit Reconciliation Report\n\n';
    report += `Generated: ${new Date().toISOString()}\n\n`;
    
    report += '## Schema Analysis\n\n';
    report += `### Source System: ${sourceSchema.tableName}\n`;
    report += `- Columns: ${sourceSchema.columns.length}\n`;
    report += `- Indexes: ${sourceSchema.indexes.length}\n\n`;
    
    report += `### Target System: ${targetSchema.tableName}\n`;
    report += `- Columns: ${targetSchema.columns.length}\n`;
    report += `- Indexes: ${targetSchema.indexes.length}\n\n`;
    
    report += '## Mapping Validation\n\n';
    report += `Status: ${validationResult.valid ? '✅ PASSED' : '❌ FAILED'}\n\n`;
    
    if (validationResult.errors.length > 0) {
      report += '### Errors\n\n';
      validationResult.errors.forEach(error => {
        report += `- ❌ ${error}\n`;
      });
      report += '\n';
    }
    
    if (validationResult.warnings.length > 0) {
      report += '### Warnings\n\n';
      validationResult.warnings.forEach(warning => {
        report += `- ⚠️ ${warning}\n`;
      });
      report += '\n';
    }
    
    report += '## Reconciliation Results\n\n';
    report += `### Summary\n\n`;
    report += `- Total Source Records: ${batchResult.totalSource}\n`;
    report += `- Total Target Records: ${batchResult.totalTarget}\n`;
    report += `- Matched: ${batchResult.matched} (${((batchResult.matched / batchResult.totalSource) * 100).toFixed(2)}%)\n`;
    report += `- Missing in Target: ${batchResult.missingInTarget}\n`;
    report += `- Missing in Source: ${batchResult.missingInSource}\n`;
    report += `- Amount Mismatches: ${batchResult.amountMismatches}\n\n`;
    
    report += `### Financial Summary\n\n`;
    report += `- Total Source Amount: $${batchResult.totalSourceAmount.toFixed(2)}\n`;
    report += `- Total Target Amount: $${batchResult.totalTargetAmount.toFixed(2)}\n`;
    report += `- Difference: $${batchResult.amountDifference.toFixed(2)}\n\n`;
    
    report += '### Detailed Records\n\n';
    report += '| Status | Source ID | Target ID | Source Amount | Target Amount | Difference |\n';
    report += '|--------|-----------|-----------|---------------|---------------|------------|\n';
    
    batchResult.records.forEach(record => {
      const statusIcon = record.status === 'matched' ? '✅' : 
                        record.status === 'amount_mismatch' ? '⚠️' : '❌';
      const srcAmt = record.sourceAmount ? `$${record.sourceAmount.toFixed(2)}` : '-';
      const tgtAmt = record.targetAmount ? `$${record.targetAmount.toFixed(2)}` : '-';
      const diff = record.amountDifference ? `$${record.amountDifference.toFixed(2)}` : '-';
      
      report += `| ${statusIcon} ${record.status} | ${record.sourceId || '-'} | ${record.targetId || '-'} | ${srcAmt} | ${tgtAmt} | ${diff} |\n`;
    });
    
    report += '\n## Conclusion\n\n';
    if (batchResult.matched === batchResult.totalSource && batchResult.missingInSource === 0) {
      report += '✅ Reconciliation successful: All records matched.\n';
    } else {
      report += '⚠️ Reconciliation completed with discrepancies that require investigation.\n';
    }

    fs.writeFileSync(reportPath, report, 'utf-8');
  }

  /**
   * Generate audit timeline
   */
  generateAuditTimeline(auditEntries: AuditLogEntry[]): void {
    const reportPath = path.join(this.outputDir, 'audit_timeline.md');
    
    let report = '# Audit Timeline\n\n';
    report += `Generated: ${new Date().toISOString()}\n\n`;
    report += '## Event Log\n\n';
    
    auditEntries.forEach((entry, index) => {
      report += `### Event ${index + 1}\n\n`;
      report += `- **Timestamp**: ${entry.timestamp.toISOString()}\n`;
      report += `- **Actor**: ${entry.actor}\n`;
      report += `- **Action**: ${entry.action}\n`;
      
      if (entry.stateBefore) {
        report += `- **Previous State**: ${JSON.stringify(entry.stateBefore, null, 2)}\n`;
      }
      
      if (entry.stateAfter) {
        report += `- **New State**: ${JSON.stringify(entry.stateAfter, null, 2)}\n`;
      }
      
      report += '\n';
    });
    
    report += '## Summary\n\n';
    report += `Total Events: ${auditEntries.length}\n`;

    fs.writeFileSync(reportPath, report, 'utf-8');
  }

  /**
   * Generate reliability metrics
   */
  generateReliabilityMetrics(
    batchResult: BatchCheckResult,
    executionTimeMs: number,
    crvValidationsPassed: number,
    crvValidationsFailed: number,
    policyChecksPassed: number,
    policyChecksFailed: number
  ): void {
    const reportPath = path.join(this.outputDir, 'reliability_metrics.json');
    
    const matchRate = batchResult.totalSource > 0 
      ? batchResult.matched / batchResult.totalSource 
      : 0;
    
    const errorRate = batchResult.totalSource > 0
      ? (batchResult.missingInTarget + batchResult.amountMismatches) / batchResult.totalSource
      : 0;
    
    const metrics: ReliabilityMetrics = {
      reconciliation_accuracy: matchRate,
      total_records_processed: batchResult.totalSource,
      match_rate: matchRate,
      error_rate: errorRate,
      execution_time_ms: executionTimeMs,
      timestamp: new Date().toISOString(),
      crv_validations_passed: crvValidationsPassed,
      crv_validations_failed: crvValidationsFailed,
      policy_checks_passed: policyChecksPassed,
      policy_checks_failed: policyChecksFailed,
    };

    fs.writeFileSync(reportPath, JSON.stringify(metrics, null, 2), 'utf-8');
  }
}
