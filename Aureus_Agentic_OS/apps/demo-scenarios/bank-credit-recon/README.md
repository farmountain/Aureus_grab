# Bank Credit Reconciliation Demo Scenario

A complete demonstration of the Aureus Agentic OS capabilities through a bank credit reconciliation workflow.

## Overview

This demo scenario showcases how Aureus components work together to perform a reliable, auditable, and validated reconciliation process between two financial systems:

- **Source System**: Bank transaction records (credit transactions)
- **Target System**: Credit ledger entries

## Architecture

The reconciliation workflow uses the following Aureus components:

### Core Components Used

1. **World Model** - State management for tracking entities (transactions, ledger entries)
2. **HipCortex** - Provenance memory for audit trail and temporal tracking
3. **CRV (Circuit Reasoning Validation)** - Validation gates for mapping configuration
4. **Policy (Goal-Guard FSM)** - Authorization gates for risky actions

### Workflow Steps

The reconciliation follows this task workflow:

1. **Extract Schema from DDLs** - Parse source and target database schemas
2. **Validate Mappings** - Use CRV to validate field mappings between systems
3. **Sample Batch Checks** - Reconcile a batch of transactions
4. **Produce Reconciliation Report** - Generate detailed reports and metrics

## Directory Structure

```
bank-credit-recon/
├── fixtures/              # Test data and configuration
│   ├── source_system.ddl  # Source database schema
│   ├── target_system.ddl  # Target database schema
│   ├── mapping_config.json # Field mapping configuration
│   └── sample_data.json   # Sample transaction data
├── src/                   # Source code
│   ├── index.ts           # Main orchestration
│   ├── schema-extractor.ts # DDL parser
│   ├── mapping-validator.ts # CRV-based validator
│   ├── batch-checker.ts   # Reconciliation logic
│   └── report-generator.ts # Report generators
├── tests/                 # Test suite
│   └── reconciliation.test.ts
├── outputs/               # Generated reports (created at runtime)
│   ├── recon_report.md
│   ├── audit_timeline.md
│   └── reliability_metrics.json
├── package.json
├── tsconfig.json
└── README.md
```

## Installation

From the demo scenario directory:

```bash
cd apps/demo-scenarios/bank-credit-recon
npm install
```

## Building

Compile TypeScript to JavaScript:

```bash
npm run build
```

## Running the Scenario

### Option 1: Run as Node.js Script

```bash
npm start
```

### Option 2: Run with Node Directly

```bash
node dist/index.js
```

### Option 3: Run Tests (Deterministic)

The test suite provides a deterministic way to run the scenario:

```bash
npm test
```

## Expected Output

When you run the scenario, you'll see:

```
🚀 Starting Bank Credit Reconciliation...

📋 Step 1: Extracting schemas from DDL files...
  ✓ Source schema: bank_transactions (9 columns)
  ✓ Target schema: credit_ledger (10 columns)

🔒 Step 2: Checking policy for validation action...
  ✓ Policy check passed

✅ Step 3: Validating mappings with CRV...
  ✓ Mapping validation passed

🔒 Step 4: Checking policy for reconciliation action...
  ✓ Policy check passed

🔍 Step 5: Performing batch reconciliation checks...
  ✓ Processed 4 source records
  ✓ Processed 3 target records
  ✓ Matched: 3
  ✓ Missing in target: 1
  ✓ Missing in source: 0
  ✓ Amount mismatches: 0

📝 Step 6: Generating reports...
  ✓ Generated recon_report.md
  ✓ Generated audit_timeline.md
  ✓ Generated reliability_metrics.json

✨ Reconciliation complete!

Total execution time: 45ms
Match rate: 75.00%
```

## Generated Reports

### 1. recon_report.md

A comprehensive reconciliation report containing:
- Schema analysis (source and target tables)
- Mapping validation results (CRV checks)
- Reconciliation statistics
- Financial summary (amounts, differences)
- Detailed record-by-record breakdown
- Conclusion and recommendations

### 2. audit_timeline.md

A complete audit trail showing:
- All actions performed during reconciliation
- Actor information (system/user)
- State changes before/after each action
- Timestamps for each event

### 3. reliability_metrics.json

Machine-readable metrics including:
- Reconciliation accuracy
- Match rates and error rates
- Execution time
- CRV validation statistics
- Policy check statistics
- Timestamp

Example:

```json
{
  "reconciliation_accuracy": 0.75,
  "total_records_processed": 4,
  "match_rate": 0.75,
  "error_rate": 0.25,
  "execution_time_ms": 45,
  "timestamp": "2024-01-20T10:00:00.000Z",
  "crv_validations_passed": 1,
  "crv_validations_failed": 0,
  "policy_checks_passed": 2,
  "policy_checks_failed": 0
}
```

## Sample Data

The scenario includes deterministic test data:

- **4 source transactions** (bank_transactions)
  - All are CREDIT type transactions
  - Amounts: $1,500.00, $2,500.50, $750.25, $3,200.00
  - Total: $7,950.75

- **3 target ledger entries** (credit_ledger)
  - 3 matched records
  - 1 missing record (TXN004)
  - All in POSTED status

## Key Features Demonstrated

### 1. Durability
- All actions are logged to HipCortex
- State persisted in World Model
- Full audit trail maintained

### 2. Validation (CRV)
- Mapping configuration validated before use
- Schema compatibility checked
- Data validation gates applied

### 3. Governance (Policy)
- Actions require appropriate permissions
- Risk tiers control access (LOW for validation, MEDIUM for reconciliation)
- Principal-based authorization

### 4. Auditability
- Every action logged with timestamp
- State changes tracked
- Complete timeline available for investigation

### 5. Reproducibility
- Deterministic test data
- Consistent results across runs
- Automated test validation

## Customization

### Modifying Test Data

Edit `fixtures/sample_data.json` to add more transactions or change amounts.

### Changing Mapping Rules

Edit `fixtures/mapping_config.json` to modify field mappings or add validation rules.

### Adjusting Schemas

Edit `fixtures/source_system.ddl` or `fixtures/target_system.ddl` to change table structures.

## Integration with Aureus Components

This scenario demonstrates real-world usage of:

- **@aureus/world-model**: Entity tracking and state management
- **@aureus/memory-hipcortex**: Audit logging and provenance
- **@aureus/crv**: Validation gates for data quality
- **@aureus/policy**: Goal-guard FSM for authorization

## Troubleshooting

### Build Errors

If you encounter build errors, ensure all dependencies are built:

```bash
cd /path/to/Aureus_Agentic_OS
npm install
npm run build
```

### Missing Outputs

Outputs are generated at runtime in the `outputs/` directory. If missing:
1. Check that the scenario ran successfully
2. Verify write permissions on the outputs directory

### Test Failures

Tests run the scenario and validate outputs. If tests fail:
1. Check that fixtures are present and valid
2. Review test output for specific assertion failures
3. Ensure no previous outputs interfere (tests clean the directory)

## License

MIT
