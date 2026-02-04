/**
 * Schema definition for input/output validation
 */
export interface ToolSchema {
  type: string;
  properties?: Record<string, SchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface SchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  pattern?: string;
  minimum?: number;
  maximum?: number;
  items?: SchemaProperty;
}

/**
 * Idempotency strategies for handling retries
 */
export enum IdempotencyStrategy {
  /**
   * Use cache to replay results (default for side-effect tools)
   */
  CACHE_REPLAY = 'cache_replay',
  
  /**
   * Tool is naturally idempotent, safe to re-execute
   */
  NATURAL = 'natural',
  
  /**
   * Use unique request ID to detect duplicates at tool level
   */
  REQUEST_ID = 'request_id',
  
  /**
   * No idempotency guarantee, always re-execute
   */
  NONE = 'none',
}

/**
 * Compensation action for saga pattern
 */
export interface CompensationAction {
  /**
   * Function to execute compensation/rollback
   */
  execute: (originalParams: Record<string, unknown>, result: unknown) => Promise<void>;
  
  /**
   * Description of what the compensation does
   */
  description: string;
  
  /**
   * Maximum number of compensation retry attempts
   */
  maxRetries?: number;
  
  /**
   * Timeout in milliseconds for compensation
   */
  timeoutMs?: number;
}

/**
 * Compensation capability for tool
 */
export interface CompensationCapability {
  /**
   * Whether this tool supports compensation
   */
  supported: boolean;
  
  /**
   * Compensation action if supported
   */
  action?: CompensationAction;
  
  /**
   * Whether compensation is automatic or manual
   */
  mode?: 'automatic' | 'manual';
}

/**
 * Validation error details
 */
export interface ValidationError {
  field?: string;
  message: string;
  code?: string;
}

/**
 * Validation result for schemas
 */
export interface SchemaValidationResult {
  valid: boolean;
  errors?: ValidationError[];
}
