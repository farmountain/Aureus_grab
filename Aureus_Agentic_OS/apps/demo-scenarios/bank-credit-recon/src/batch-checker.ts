/**
 * Batch reconciliation checker
 * Performs reconciliation checks on batches of transactions
 */

import { WorldModel, Entity } from '@aureus/world-model';

export interface ReconciliationRecord {
  sourceId: string;
  targetId: string;
  status: 'matched' | 'missing_in_target' | 'missing_in_source' | 'amount_mismatch';
  sourceAmount?: number;
  targetAmount?: number;
  amountDifference?: number;
}

export interface BatchCheckResult {
  totalSource: number;
  totalTarget: number;
  matched: number;
  missingInTarget: number;
  missingInSource: number;
  amountMismatches: number;
  records: ReconciliationRecord[];
  totalSourceAmount: number;
  totalTargetAmount: number;
  amountDifference: number;
}

export interface TransactionRecord {
  transaction_id?: string;
  ledger_id?: string;
  account_number?: string;
  account_id?: string;
  amount?: number;
  credit_amount?: number;
  reference_number?: string;
  external_ref?: string;
  [key: string]: any;
}

// Configurable tolerance for amount comparison
const AMOUNT_TOLERANCE = 0.01;

export class BatchReconciliationChecker {
  private worldModel: WorldModel;

  constructor() {
    // Initialize world model for state tracking
    this.worldModel = new WorldModel({
      id: 'recon-state',
      entities: new Map(),
      relationships: [],
      constraints: [],
      timestamp: new Date(),
    });
  }

  /**
   * Perform batch reconciliation check
   */
  async checkBatch(
    sourceRecords: TransactionRecord[],
    targetRecords: TransactionRecord[]
  ): Promise<BatchCheckResult> {
    const records: ReconciliationRecord[] = [];
    
    // Store records in world model
    sourceRecords.forEach(record => {
      const entity: Entity = {
        id: `source-${record.transaction_id}`,
        type: 'source_transaction',
        properties: record,
      };
      this.worldModel.addEntity(entity);
    });

    targetRecords.forEach(record => {
      const entity: Entity = {
        id: `target-${record.ledger_id}`,
        type: 'target_ledger',
        properties: record,
      };
      this.worldModel.addEntity(entity);
    });

    // Build reference maps
    const sourceByRef = new Map<string, TransactionRecord>();
    const targetByRef = new Map<string, TransactionRecord>();

    sourceRecords.forEach(record => {
      if (record.reference_number) {
        sourceByRef.set(record.reference_number, record);
      }
    });

    targetRecords.forEach(record => {
      if (record.external_ref) {
        targetByRef.set(record.external_ref, record);
      }
    });

    let totalSourceAmount = 0;
    let totalTargetAmount = 0;

    // Check source records against target
    for (const sourceRecord of sourceRecords) {
      const sourceId = sourceRecord.transaction_id || '';
      const sourceAmount = sourceRecord.amount || 0;
      totalSourceAmount += sourceAmount;

      const refNum = sourceRecord.reference_number;
      if (!refNum) {
        records.push({
          sourceId,
          targetId: '',
          status: 'missing_in_target',
          sourceAmount,
        });
        continue;
      }

      const targetRecord = targetByRef.get(refNum);
      if (!targetRecord) {
        records.push({
          sourceId,
          targetId: '',
          status: 'missing_in_target',
          sourceAmount,
        });
      } else {
        const targetId = targetRecord.ledger_id || '';
        const targetAmount = targetRecord.credit_amount || 0;

        if (Math.abs(sourceAmount - targetAmount) < AMOUNT_TOLERANCE) {
          records.push({
            sourceId,
            targetId,
            status: 'matched',
            sourceAmount,
            targetAmount,
          });
        } else {
          records.push({
            sourceId,
            targetId,
            status: 'amount_mismatch',
            sourceAmount,
            targetAmount,
            amountDifference: sourceAmount - targetAmount,
          });
        }
      }
    }

    // Check for target records not in source
    for (const targetRecord of targetRecords) {
      const targetAmount = targetRecord.credit_amount || 0;
      totalTargetAmount += targetAmount;

      const refNum = targetRecord.external_ref;
      if (refNum && !sourceByRef.has(refNum)) {
        records.push({
          sourceId: '',
          targetId: targetRecord.ledger_id || '',
          status: 'missing_in_source',
          targetAmount,
        });
      }
    }

    // Calculate statistics
    const matched = records.filter(r => r.status === 'matched').length;
    const missingInTarget = records.filter(r => r.status === 'missing_in_target').length;
    const missingInSource = records.filter(r => r.status === 'missing_in_source').length;
    const amountMismatches = records.filter(r => r.status === 'amount_mismatch').length;

    return {
      totalSource: sourceRecords.length,
      totalTarget: targetRecords.length,
      matched,
      missingInTarget,
      missingInSource,
      amountMismatches,
      records,
      totalSourceAmount,
      totalTargetAmount,
      amountDifference: totalSourceAmount - totalTargetAmount,
    };
  }

  /**
   * Get world model state
   */
  getWorldModel(): WorldModel {
    return this.worldModel;
  }
}
