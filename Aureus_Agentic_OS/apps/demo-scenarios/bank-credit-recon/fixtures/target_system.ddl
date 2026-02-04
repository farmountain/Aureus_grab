-- Target System: Credit Ledger Table
CREATE TABLE credit_ledger (
  ledger_id VARCHAR(50) PRIMARY KEY,
  account_id VARCHAR(20) NOT NULL,
  posting_date DATE NOT NULL,
  credit_amount DECIMAL(15, 2) NOT NULL,
  status VARCHAR(20) CHECK (status IN ('PENDING', 'POSTED', 'REVERSED')),
  memo TEXT,
  external_ref VARCHAR(50),
  batch_id VARCHAR(30),
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  modified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_account_posting ON credit_ledger(account_id, posting_date);
CREATE INDEX idx_external_ref ON credit_ledger(external_ref);
CREATE INDEX idx_batch ON credit_ledger(batch_id);
