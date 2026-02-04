# Demo Scenarios

Reproducible scenarios + fixtures demonstrating Aureus Agentic OS capabilities.

## Available Scenarios

### Bank Credit Reconciliation

**Location**: `apps/demo-scenarios/bank-credit-recon`

A complete demonstration of a bank credit reconciliation workflow that showcases:
- Schema extraction from DDL files
- Mapping validation using CRV
- Batch reconciliation checks
- Report generation with audit trails

**Components Used**:
- World Model (state management)
- HipCortex (provenance memory)
- CRV (validation gates)
- Policy (authorization gates)

**Outputs**:
- `recon_report.md` - Detailed reconciliation report
- `audit_timeline.md` - Complete audit trail
- `reliability_metrics.json` - Performance metrics

**How to Run**:
```bash
cd apps/demo-scenarios/bank-credit-recon
npm install
npm run build
npm start
```

**Run Tests**:
```bash
npm test
```

See [bank-credit-recon/README.md](./bank-credit-recon/README.md) for complete documentation.
