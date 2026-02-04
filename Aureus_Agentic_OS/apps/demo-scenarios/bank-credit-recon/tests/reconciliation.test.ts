/**
 * Deterministic test for bank credit reconciliation scenario
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { BankCreditReconciliation } from '../src/index';

describe('Bank Credit Reconciliation', () => {
  const baseDir = path.join(__dirname, '..');
  const fixturesDir = path.join(baseDir, 'fixtures');
  const outputDir = path.join(baseDir, 'outputs');

  beforeAll(() => {
    // Clean output directory before tests
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true });
    }
  });

  it('should run complete reconciliation workflow', async () => {
    const reconciliation = new BankCreditReconciliation(outputDir);
    
    // Run the reconciliation
    await reconciliation.run(fixturesDir);

    // Verify outputs were created
    expect(fs.existsSync(path.join(outputDir, 'recon_report.md'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'audit_timeline.md'))).toBe(true);
    expect(fs.existsSync(path.join(outputDir, 'reliability_metrics.json'))).toBe(true);
  });

  it('should generate correct reconciliation report', async () => {
    const reconciliation = new BankCreditReconciliation(outputDir);
    await reconciliation.run(fixturesDir);

    const report = fs.readFileSync(path.join(outputDir, 'recon_report.md'), 'utf-8');
    
    // Check report contains expected sections
    expect(report).toContain('# Bank Credit Reconciliation Report');
    expect(report).toContain('## Schema Analysis');
    expect(report).toContain('## Mapping Validation');
    expect(report).toContain('## Reconciliation Results');
    expect(report).toContain('## Conclusion');
    
    // Check specific metrics
    expect(report).toContain('Total Source Records: 4');
    expect(report).toContain('Total Target Records: 3');
    expect(report).toContain('Matched: 3');
    expect(report).toContain('Missing in Target: 1');
  });

  it('should generate audit timeline', async () => {
    const reconciliation = new BankCreditReconciliation(outputDir);
    await reconciliation.run(fixturesDir);

    const auditTimeline = fs.readFileSync(path.join(outputDir, 'audit_timeline.md'), 'utf-8');
    
    // Check audit timeline structure
    expect(auditTimeline).toContain('# Audit Timeline');
    expect(auditTimeline).toContain('## Event Log');
    expect(auditTimeline).toContain('extract_schema');
    expect(auditTimeline).toContain('validate_mapping');
    expect(auditTimeline).toContain('reconcile_batch');
    expect(auditTimeline).toContain('generate_reports');
  });

  it('should generate reliability metrics', async () => {
    const reconciliation = new BankCreditReconciliation(outputDir);
    await reconciliation.run(fixturesDir);

    const metricsJson = fs.readFileSync(path.join(outputDir, 'reliability_metrics.json'), 'utf-8');
    const metrics = JSON.parse(metricsJson);
    
    // Check metrics structure
    expect(metrics).toHaveProperty('reconciliation_accuracy');
    expect(metrics).toHaveProperty('total_records_processed');
    expect(metrics).toHaveProperty('match_rate');
    expect(metrics).toHaveProperty('error_rate');
    expect(metrics).toHaveProperty('execution_time_ms');
    expect(metrics).toHaveProperty('timestamp');
    expect(metrics).toHaveProperty('crv_validations_passed');
    expect(metrics).toHaveProperty('policy_checks_passed');
    
    // Check specific values
    expect(metrics.total_records_processed).toBe(4);
    expect(metrics.match_rate).toBe(0.75); // 3 out of 4 matched
    expect(metrics.crv_validations_passed).toBeGreaterThanOrEqual(1);
    expect(metrics.policy_checks_passed).toBe(2);
  });

  it('should validate schemas correctly', async () => {
    const reconciliation = new BankCreditReconciliation(outputDir);
    await reconciliation.run(fixturesDir);

    const report = fs.readFileSync(path.join(outputDir, 'recon_report.md'), 'utf-8');
    
    // Check source schema
    expect(report).toContain('Source System: bank_transactions');
    expect(report).toContain('Columns: 9');
    
    // Check target schema
    expect(report).toContain('Target System: credit_ledger');
    expect(report).toContain('Columns: 10');
  });

  it('should perform deterministic reconciliation', async () => {
    // Run twice and compare results
    const reconciliation1 = new BankCreditReconciliation(outputDir);
    await reconciliation1.run(fixturesDir);
    
    const metrics1 = JSON.parse(
      fs.readFileSync(path.join(outputDir, 'reliability_metrics.json'), 'utf-8')
    );

    // Clean and run again
    fs.rmSync(outputDir, { recursive: true });
    
    const reconciliation2 = new BankCreditReconciliation(outputDir);
    await reconciliation2.run(fixturesDir);
    
    const metrics2 = JSON.parse(
      fs.readFileSync(path.join(outputDir, 'reliability_metrics.json'), 'utf-8')
    );

    // Compare key metrics (excluding timestamp and execution_time_ms)
    expect(metrics1.reconciliation_accuracy).toBe(metrics2.reconciliation_accuracy);
    expect(metrics1.total_records_processed).toBe(metrics2.total_records_processed);
    expect(metrics1.match_rate).toBe(metrics2.match_rate);
    expect(metrics1.error_rate).toBe(metrics2.error_rate);
  });
});
