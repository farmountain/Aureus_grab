/**
 * Bank Credit Reconciliation Demo Scenario
 * 
 * This demo showcases a complete reconciliation workflow that:
 * 1. Extracts schema from DDL files
 * 2. Validates mappings using CRV
 * 3. Performs sample batch checks
 * 4. Produces reconciliation reports
 * 
 * Uses:
 * - world-model for state management
 * - hipcortex for provenance memory
 * - CRV for validation
 * - policy for gating
 */

import * as fs from 'fs';
import * as path from 'path';
import { SchemaExtractor } from './schema-extractor';
import { MappingValidator, MappingConfig } from './mapping-validator';
import { BatchReconciliationChecker, TransactionRecord } from './batch-checker';
import { ReportGenerator } from './report-generator';
import { HipCortex } from '@aureus/memory-hipcortex';
import { GoalGuardFSM, RiskTier, Principal, Action } from '@aureus/policy';

export class BankCreditReconciliation {
  private schemaExtractor: SchemaExtractor;
  private mappingValidator: MappingValidator;
  private batchChecker: BatchReconciliationChecker;
  private reportGenerator: ReportGenerator;
  private hipCortex: HipCortex;
  private goalGuard: GoalGuardFSM;
  private startTime: number;

  constructor(outputDir: string) {
    this.schemaExtractor = new SchemaExtractor();
    this.mappingValidator = new MappingValidator();
    this.batchChecker = new BatchReconciliationChecker();
    this.reportGenerator = new ReportGenerator(outputDir);
    this.hipCortex = new HipCortex();
    this.goalGuard = new GoalGuardFSM();
    this.startTime = Date.now();
  }

  /**
   * Run the complete reconciliation workflow
   */
  async run(fixturesDir: string): Promise<void> {
    console.log('🚀 Starting Bank Credit Reconciliation...\n');

    // Step 1: Extract schemas from DDL files
    console.log('📋 Step 1: Extracting schemas from DDL files...');
    const sourceDDL = fs.readFileSync(
      path.join(fixturesDir, 'source_system.ddl'),
      'utf-8'
    );
    const targetDDL = fs.readFileSync(
      path.join(fixturesDir, 'target_system.ddl'),
      'utf-8'
    );

    const sourceSchema = this.schemaExtractor.extractSchema(sourceDDL);
    const targetSchema = this.schemaExtractor.extractSchema(targetDDL);

    console.log(`  ✓ Source schema: ${sourceSchema.tableName} (${sourceSchema.columns.length} columns)`);
    console.log(`  ✓ Target schema: ${targetSchema.tableName} (${targetSchema.columns.length} columns)\n`);

    // Log to audit
    this.hipCortex.logAction('system', 'extract_schema', null, {
      source: sourceSchema.tableName,
      target: targetSchema.tableName,
    });

    // Step 2: Policy check for validation action
    console.log('🔒 Step 2: Checking policy for validation action...');
    const principal: Principal = {
      id: 'reconciliation-agent',
      type: 'agent',
      permissions: [
        { action: 'validate', resource: 'mapping' },
        { action: 'reconcile', resource: 'transactions' },
        { action: 'generate', resource: 'report' },
      ],
    };

    const validationAction: Action = {
      id: 'validate-mapping',
      name: 'Validate Mapping Configuration',
      riskTier: RiskTier.LOW,
      requiredPermissions: [{ action: 'validate', resource: 'mapping' }],
    };

    const policyDecision = await this.goalGuard.evaluate(principal, validationAction);
    if (!policyDecision.allowed) {
      throw new Error('Policy check failed: validation action not allowed');
    }
    console.log('  ✓ Policy check passed\n');

    // Step 3: Validate mappings using CRV
    console.log('✅ Step 3: Validating mappings with CRV...');
    const mappingConfig: MappingConfig = JSON.parse(
      fs.readFileSync(path.join(fixturesDir, 'mapping_config.json'), 'utf-8')
    );

    const validationResult = await this.mappingValidator.validateMapping(
      mappingConfig,
      sourceSchema,
      targetSchema
    );

    if (validationResult.valid) {
      console.log('  ✓ Mapping validation passed');
    } else {
      console.log('  ✗ Mapping validation failed');
      validationResult.errors.forEach(error => console.log(`    - ${error}`));
    }

    if (validationResult.warnings.length > 0) {
      console.log('  ⚠ Warnings:');
      validationResult.warnings.forEach(warning => console.log(`    - ${warning}`));
    }
    console.log();

    // Log to audit
    this.hipCortex.logAction('system', 'validate_mapping', null, {
      valid: validationResult.valid,
      errors: validationResult.errors.length,
      warnings: validationResult.warnings.length,
    });

    // Step 4: Policy check for reconciliation action
    console.log('🔒 Step 4: Checking policy for reconciliation action...');
    const reconcileAction: Action = {
      id: 'reconcile-batch',
      name: 'Reconcile Transaction Batch',
      riskTier: RiskTier.MEDIUM,
      requiredPermissions: [{ action: 'reconcile', resource: 'transactions' }],
    };

    const reconPolicyDecision = await this.goalGuard.evaluate(principal, reconcileAction);
    if (!reconPolicyDecision.allowed) {
      throw new Error('Policy check failed: reconciliation action not allowed');
    }
    console.log('  ✓ Policy check passed\n');

    // Step 5: Perform batch reconciliation
    console.log('🔍 Step 5: Performing batch reconciliation checks...');
    const sampleData = JSON.parse(
      fs.readFileSync(path.join(fixturesDir, 'sample_data.json'), 'utf-8')
    );

    const batchResult = await this.batchChecker.checkBatch(
      sampleData.source_transactions,
      sampleData.target_ledger
    );

    console.log(`  ✓ Processed ${batchResult.totalSource} source records`);
    console.log(`  ✓ Processed ${batchResult.totalTarget} target records`);
    console.log(`  ✓ Matched: ${batchResult.matched}`);
    console.log(`  ✓ Missing in target: ${batchResult.missingInTarget}`);
    console.log(`  ✓ Missing in source: ${batchResult.missingInSource}`);
    console.log(`  ✓ Amount mismatches: ${batchResult.amountMismatches}\n`);

    // Log to audit
    this.hipCortex.logAction('system', 'reconcile_batch', null, {
      totalSource: batchResult.totalSource,
      totalTarget: batchResult.totalTarget,
      matched: batchResult.matched,
    });

    // Step 6: Generate reports
    console.log('📝 Step 6: Generating reports...');
    
    // Log action before generating reports
    this.hipCortex.logAction('system', 'generate_reports', null, {
      generating: true,
    });
    
    this.reportGenerator.generateReconciliationReport(
      sourceSchema,
      targetSchema,
      validationResult,
      batchResult
    );
    console.log('  ✓ Generated recon_report.md');

    const auditEntries = this.hipCortex.getAuditLog();
    this.reportGenerator.generateAuditTimeline(auditEntries);
    console.log('  ✓ Generated audit_timeline.md');

    const executionTime = Date.now() - this.startTime;
    this.reportGenerator.generateReliabilityMetrics(
      batchResult,
      executionTime,
      validationResult.valid ? 1 : 0,
      validationResult.valid ? 0 : 1,
      2, // policy checks passed
      0  // policy checks failed
    );
    console.log('  ✓ Generated reliability_metrics.json\n');

    console.log('✨ Reconciliation complete!\n');
    console.log(`Total execution time: ${executionTime}ms`);
    console.log(`Match rate: ${((batchResult.matched / batchResult.totalSource) * 100).toFixed(2)}%`);
  }
}

// Main entry point
export async function main(): Promise<void> {
  const baseDir = __dirname + '/..';
  const fixturesDir = path.join(baseDir, 'fixtures');
  const outputDir = path.join(baseDir, 'outputs');

  const reconciliation = new BankCreditReconciliation(outputDir);
  await reconciliation.run(fixturesDir);
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}
