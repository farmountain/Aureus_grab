-- Source System: Bank Transaction Table
CREATE TABLE bank_transactions (
  transaction_id VARCHAR(50) PRIMARY KEY,
  account_number VARCHAR(20) NOT NULL,
  transaction_date DATE NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  transaction_type VARCHAR(20) CHECK (transaction_type IN ('CREDIT', 'DEBIT')),
  description VARCHAR(255),
  reference_number VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_account_date ON bank_transactions(account_number, transaction_date);
CREATE INDEX idx_reference ON bank_transactions(reference_number);
