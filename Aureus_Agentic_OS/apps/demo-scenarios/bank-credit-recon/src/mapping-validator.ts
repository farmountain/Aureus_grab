/**
 * Mapping validator using CRV
 * Validates field mappings between source and target systems
 */

import { CRVGate, Validators, Commit } from '@aureus/crv';
import { TableSchema } from './schema-extractor';

export interface FieldMapping {
  source_field: string;
  target_field: string;
  transformation: string;
  validation?: {
    min?: number;
    max?: number;
  };
}

export interface MappingConfig {
  mapping_name: string;
  version: string;
  source: {
    system: string;
    filters?: Record<string, string>;
  };
  target: {
    system: string;
  };
  field_mappings: FieldMapping[];
  reconciliation_keys: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class MappingValidator {
  private crvGate: CRVGate;

  constructor() {
    // Setup CRV gate for mapping validation
    this.crvGate = new CRVGate({
      name: 'Mapping Validation Gate',
      validators: [
        Validators.notNull(),
      ],
      blockOnFailure: true,
    });
  }

  /**
   * Validate mapping configuration
   */
  async validateMapping(
    config: MappingConfig,
    sourceSchema: TableSchema,
    targetSchema: TableSchema
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate config structure with CRV
    const commit: Commit = {
      id: 'mapping-validation',
      data: config,
    };

    const gateResult = await this.crvGate.validate(commit);
    if (gateResult.blockedCommit) {
      errors.push('CRV gate blocked mapping configuration');
      return { valid: false, errors, warnings };
    }

    // Validate source fields exist
    const sourceFieldNames = sourceSchema.columns.map(c => c.name);
    for (const mapping of config.field_mappings) {
      if (!sourceFieldNames.includes(mapping.source_field)) {
        errors.push(`Source field '${mapping.source_field}' not found in schema`);
      }
    }

    // Validate target fields exist
    const targetFieldNames = targetSchema.columns.map(c => c.name);
    for (const mapping of config.field_mappings) {
      if (!targetFieldNames.includes(mapping.target_field)) {
        errors.push(`Target field '${mapping.target_field}' not found in schema`);
      }
    }

    // Validate reconciliation keys exist in target
    for (const key of config.reconciliation_keys) {
      if (!targetFieldNames.includes(key)) {
        errors.push(`Reconciliation key '${key}' not found in target schema`);
      }
    }

    // Check for type compatibility (warnings only)
    for (const mapping of config.field_mappings) {
      const sourceCol = sourceSchema.columns.find(c => c.name === mapping.source_field);
      const targetCol = targetSchema.columns.find(c => c.name === mapping.target_field);
      
      if (sourceCol && targetCol && sourceCol.type !== targetCol.type) {
        warnings.push(
          `Type mismatch: ${mapping.source_field} (${sourceCol.type}) -> ${mapping.target_field} (${targetCol.type})`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
