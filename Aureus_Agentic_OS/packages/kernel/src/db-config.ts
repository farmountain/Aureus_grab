import { Pool, PoolConfig } from 'pg';

/**
 * Database configuration interface
 */
export interface DatabaseConfig {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  connectionString?: string;
  ssl?: boolean | { rejectUnauthorized: boolean };
  max?: number; // Maximum pool size
  min?: number; // Minimum pool size
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

/**
 * Create a PostgreSQL connection pool from environment variables or config
 */
export function createDatabasePool(config?: DatabaseConfig): Pool {
  // Priority: explicit config > DATABASE_URL > individual env vars
  const poolConfig: PoolConfig = {};

  if (config?.connectionString || process.env.DATABASE_URL) {
    poolConfig.connectionString = config?.connectionString || process.env.DATABASE_URL;
  } else {
    poolConfig.host = config?.host || process.env.DATABASE_HOST || 'localhost';
    poolConfig.port = config?.port || parseInt(process.env.DATABASE_PORT || '5432', 10);
    poolConfig.database = config?.database || process.env.DATABASE_NAME || 'aureus';
    poolConfig.user = config?.user || process.env.DATABASE_USER || 'aureus';
    poolConfig.password = config?.password || process.env.DATABASE_PASSWORD;
  }

  // SSL configuration
  const sslEnabled = config?.ssl !== undefined ? config.ssl : process.env.DATABASE_SSL === 'true';
  if (sslEnabled) {
    poolConfig.ssl = typeof sslEnabled === 'boolean' ? { rejectUnauthorized: false } : sslEnabled;
  }

  // Pool size configuration
  poolConfig.max = config?.max || parseInt(process.env.DATABASE_POOL_MAX || '20', 10);
  poolConfig.min = config?.min || parseInt(process.env.DATABASE_POOL_MIN || '2', 10);
  
  // Timeout configuration
  poolConfig.idleTimeoutMillis = config?.idleTimeoutMillis || parseInt(process.env.DATABASE_IDLE_TIMEOUT || '10000', 10);
  poolConfig.connectionTimeoutMillis = config?.connectionTimeoutMillis || parseInt(process.env.DATABASE_TIMEOUT || '30000', 10);

  return new Pool(poolConfig);
}

/**
 * Run database migrations from SQL file content
 */
export async function runMigrations(pool: Pool, sqlContent: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sqlContent);
    await client.query('COMMIT');
    console.log('Database migrations completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check if database connection is healthy
 */
export async function checkDatabaseHealth(pool: Pool): Promise<boolean> {
  try {
    const result = await pool.query('SELECT NOW()');
    return result.rows.length > 0;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

/**
 * Close database pool gracefully
 */
export async function closeDatabasePool(pool: Pool): Promise<void> {
  await pool.end();
  console.log('Database pool closed');
}
