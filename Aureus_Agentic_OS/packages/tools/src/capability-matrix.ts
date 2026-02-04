/**
 * Target Capability Matrix for Tools
 * 
 * Defines capabilities required for tool adapters and provides validation
 * functions to ensure agent blueprints have appropriate tool configurations.
 */

/**
 * Tool adapter capabilities
 */
export enum ToolCapability {
  // API capabilities
  HTTP_CLIENT = 'http-client',
  WEBSOCKET = 'websocket',
  GRPC = 'grpc',
  REST_API = 'rest-api',
  GRAPHQL = 'graphql',
  
  // Database capabilities
  SQL_DATABASE = 'sql-database',
  NOSQL_DATABASE = 'nosql-database',
  KEY_VALUE_STORE = 'key-value-store',
  GRAPH_DATABASE = 'graph-database',
  TIME_SERIES_DB = 'time-series-db',
  
  // File system capabilities
  FILE_SYSTEM = 'file-system',
  OBJECT_STORAGE = 'object-storage',
  BLOB_STORAGE = 'blob-storage',
  
  // Messaging capabilities
  MESSAGE_QUEUE = 'message-queue',
  PUB_SUB = 'pub-sub',
  EVENT_STREAM = 'event-stream',
  
  // Authentication & Security
  OAUTH2 = 'oauth2',
  JWT = 'jwt',
  API_KEY = 'api-key',
  ENCRYPTION = 'encryption',
  
  // Business APIs
  PAYMENT_API = 'payment-api',
  EMAIL_API = 'email-api',
  SMS_API = 'sms-api',
  MAP_API = 'map-api',
  CALENDAR_API = 'calendar-api',
  WEATHER_API = 'weather-api',
  
  // Data processing
  JSON_PROCESSING = 'json-processing',
  XML_PROCESSING = 'xml-processing',
  CSV_PROCESSING = 'csv-processing',
  PDF_PROCESSING = 'pdf-processing',
  IMAGE_PROCESSING = 'image-processing',
  
  // Execution capabilities
  SANDBOX_EXECUTION = 'sandbox-execution',
  CONTAINER_EXECUTION = 'container-execution',
  SERVERLESS_EXECUTION = 'serverless-execution',
  
  // Monitoring & Observability
  LOGGING = 'logging',
  METRICS = 'metrics',
  TRACING = 'tracing',
  ALERTING = 'alerting',
  
  // Idempotency & Reliability
  IDEMPOTENT_EXECUTION = 'idempotent-execution',
  RETRY_LOGIC = 'retry-logic',
  CIRCUIT_BREAKER = 'circuit-breaker',
  RATE_LIMITING = 'rate-limiting',
}

/**
 * Tool adapter categories and their typical capabilities
 */
export const ToolAdapterCategories: Record<string, ToolCapability[]> = {
  'api-adapter': [
    ToolCapability.HTTP_CLIENT,
    ToolCapability.REST_API,
    ToolCapability.JSON_PROCESSING,
    ToolCapability.OAUTH2,
    ToolCapability.RETRY_LOGIC,
    ToolCapability.RATE_LIMITING,
  ],
  'database-adapter': [
    ToolCapability.SQL_DATABASE,
    ToolCapability.NOSQL_DATABASE,
    ToolCapability.IDEMPOTENT_EXECUTION,
    ToolCapability.RETRY_LOGIC,
  ],
  'messaging-adapter': [
    ToolCapability.MESSAGE_QUEUE,
    ToolCapability.PUB_SUB,
    ToolCapability.EVENT_STREAM,
    ToolCapability.RETRY_LOGIC,
  ],
  'storage-adapter': [
    ToolCapability.FILE_SYSTEM,
    ToolCapability.OBJECT_STORAGE,
    ToolCapability.BLOB_STORAGE,
    ToolCapability.IDEMPOTENT_EXECUTION,
  ],
  'payment-adapter': [
    ToolCapability.HTTP_CLIENT,
    ToolCapability.PAYMENT_API,
    ToolCapability.ENCRYPTION,
    ToolCapability.IDEMPOTENT_EXECUTION,
    ToolCapability.RETRY_LOGIC,
  ],
  'communication-adapter': [
    ToolCapability.EMAIL_API,
    ToolCapability.SMS_API,
    ToolCapability.HTTP_CLIENT,
    ToolCapability.RETRY_LOGIC,
    ToolCapability.RATE_LIMITING,
  ],
  'geospatial-adapter': [
    ToolCapability.MAP_API,
    ToolCapability.HTTP_CLIENT,
    ToolCapability.JSON_PROCESSING,
  ],
  'sandbox-adapter': [
    ToolCapability.SANDBOX_EXECUTION,
    ToolCapability.CONTAINER_EXECUTION,
    ToolCapability.LOGGING,
    ToolCapability.METRICS,
  ],
  'observability-adapter': [
    ToolCapability.LOGGING,
    ToolCapability.METRICS,
    ToolCapability.TRACING,
    ToolCapability.ALERTING,
  ],
};

/**
 * Deployment target to recommended tool capabilities mapping
 */
export const DeploymentTargetToolCapabilities: Record<string, ToolCapability[]> = {
  software: [
    ToolCapability.HTTP_CLIENT,
    ToolCapability.SQL_DATABASE,
    ToolCapability.FILE_SYSTEM,
    ToolCapability.JSON_PROCESSING,
    ToolCapability.LOGGING,
    ToolCapability.METRICS,
    ToolCapability.RETRY_LOGIC,
  ],
  cloud: [
    ToolCapability.HTTP_CLIENT,
    ToolCapability.SQL_DATABASE,
    ToolCapability.NOSQL_DATABASE,
    ToolCapability.OBJECT_STORAGE,
    ToolCapability.MESSAGE_QUEUE,
    ToolCapability.SERVERLESS_EXECUTION,
    ToolCapability.LOGGING,
    ToolCapability.METRICS,
    ToolCapability.TRACING,
  ],
  edge: [
    ToolCapability.HTTP_CLIENT,
    ToolCapability.KEY_VALUE_STORE,
    ToolCapability.FILE_SYSTEM,
    ToolCapability.LOGGING,
    ToolCapability.CIRCUIT_BREAKER,
  ],
  retail: [
    ToolCapability.HTTP_CLIENT,
    ToolCapability.PAYMENT_API,
    ToolCapability.SQL_DATABASE,
    ToolCapability.EMAIL_API,
    ToolCapability.SMS_API,
    ToolCapability.IDEMPOTENT_EXECUTION,
    ToolCapability.LOGGING,
  ],
  travel: [
    ToolCapability.HTTP_CLIENT,
    ToolCapability.PAYMENT_API,
    ToolCapability.MAP_API,
    ToolCapability.CALENDAR_API,
    ToolCapability.EMAIL_API,
    ToolCapability.SMS_API,
    ToolCapability.WEATHER_API,
    ToolCapability.IDEMPOTENT_EXECUTION,
  ],
  smartphone: [
    ToolCapability.HTTP_CLIENT,
    ToolCapability.REST_API,
    ToolCapability.KEY_VALUE_STORE,
    ToolCapability.JSON_PROCESSING,
    ToolCapability.OAUTH2,
  ],
  desktop: [
    ToolCapability.HTTP_CLIENT,
    ToolCapability.FILE_SYSTEM,
    ToolCapability.SQL_DATABASE,
    ToolCapability.JSON_PROCESSING,
    ToolCapability.PDF_PROCESSING,
  ],
};

/**
 * Tool adapter configuration information
 */
export interface ToolAdapterInfo {
  name: string;
  category: string;
  providedCapabilities: ToolCapability[];
  requiredPermissions?: string[];
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Common tool adapters
 */
export const CommonToolAdapters: Record<string, ToolAdapterInfo> = {
  'http-client-tool': {
    name: 'HTTP Client',
    category: 'api-adapter',
    providedCapabilities: [
      ToolCapability.HTTP_CLIENT,
      ToolCapability.REST_API,
      ToolCapability.JSON_PROCESSING,
    ],
    requiredPermissions: ['network.http'],
    riskLevel: 'medium',
  },
  'database-tool': {
    name: 'Database Tool',
    category: 'database-adapter',
    providedCapabilities: [
      ToolCapability.SQL_DATABASE,
      ToolCapability.IDEMPOTENT_EXECUTION,
    ],
    requiredPermissions: ['database.read', 'database.write'],
    riskLevel: 'high',
  },
  'file-system-tool': {
    name: 'File System Tool',
    category: 'storage-adapter',
    providedCapabilities: [
      ToolCapability.FILE_SYSTEM,
      ToolCapability.IDEMPOTENT_EXECUTION,
    ],
    requiredPermissions: ['filesystem.read', 'filesystem.write'],
    riskLevel: 'medium',
  },
  'payment-tool': {
    name: 'Payment Tool',
    category: 'payment-adapter',
    providedCapabilities: [
      ToolCapability.PAYMENT_API,
      ToolCapability.ENCRYPTION,
      ToolCapability.IDEMPOTENT_EXECUTION,
    ],
    requiredPermissions: ['payment.process'],
    riskLevel: 'critical',
  },
  'email-tool': {
    name: 'Email Tool',
    category: 'communication-adapter',
    providedCapabilities: [
      ToolCapability.EMAIL_API,
      ToolCapability.HTTP_CLIENT,
    ],
    requiredPermissions: ['communication.email'],
    riskLevel: 'low',
  },
  'sandbox-tool': {
    name: 'Sandbox Execution Tool',
    category: 'sandbox-adapter',
    providedCapabilities: [
      ToolCapability.SANDBOX_EXECUTION,
      ToolCapability.CONTAINER_EXECUTION,
      ToolCapability.LOGGING,
    ],
    requiredPermissions: ['execution.sandbox'],
    riskLevel: 'high',
  },
};

/**
 * Validate if tool adapters provide required capabilities
 */
export function validateToolCapabilities(
  requiredCapabilities: (ToolCapability | string)[],
  toolAdapterNames: string[]
): {
  valid: boolean;
  missingCapabilities: ToolCapability[];
  recommendations?: string[];
} {
  const providedCapabilities = new Set<string>();
  
  // Collect capabilities from specified adapters
  toolAdapterNames.forEach((adapterName) => {
    const adapter = CommonToolAdapters[adapterName];
    if (adapter) {
      adapter.providedCapabilities.forEach((cap) => 
        providedCapabilities.add(cap)
      );
    }
  });

  const missing = requiredCapabilities.filter(
    (cap) => !providedCapabilities.has(cap as string)
  );

  const recommendations: string[] = [];
  
  // Suggest adapters that can provide missing capabilities
  if (missing.length > 0) {
    const missingSet = new Set(missing);
    const suggestedAdapters = Object.entries(CommonToolAdapters)
      .filter(([_, info]) => 
        info.providedCapabilities.some((cap) => missingSet.has(cap))
      )
      .map(([name, info]) => ({
        name,
        capabilities: info.providedCapabilities.filter((cap) => missingSet.has(cap)),
      }));

    if (suggestedAdapters.length > 0) {
      recommendations.push(
        'Consider adding these tool adapters to provide missing capabilities:'
      );
      suggestedAdapters.forEach(({ name, capabilities }) => {
        recommendations.push(`  - ${name}: provides ${capabilities.join(', ')}`);
      });
    }
  }

  return {
    valid: missing.length === 0,
    missingCapabilities: missing as ToolCapability[],
    recommendations: recommendations.length > 0 ? recommendations : undefined,
  };
}

/**
 * Get recommended tool capabilities for a deployment target
 */
export function getRecommendedToolCapabilities(
  deploymentTarget: string
): ToolCapability[] {
  return DeploymentTargetToolCapabilities[deploymentTarget] || [];
}

/**
 * Assess risk level of tool adapter configuration
 */
export function assessToolAdapterRisk(
  toolAdapterNames: string[]
): {
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  highRiskAdapters: string[];
  recommendations?: string[];
} {
  const riskLevels = { low: 0, medium: 1, high: 2, critical: 3 };
  let maxRisk = 0;
  const highRiskAdapters: string[] = [];
  
  toolAdapterNames.forEach((name) => {
    const adapter = CommonToolAdapters[name];
    if (adapter && adapter.riskLevel) {
      const riskValue = riskLevels[adapter.riskLevel];
      if (riskValue >= riskLevels.high) {
        highRiskAdapters.push(name);
      }
      maxRisk = Math.max(maxRisk, riskValue);
    }
  });

  const overallRisk = (Object.keys(riskLevels) as Array<keyof typeof riskLevels>)
    .find((key) => riskLevels[key] === maxRisk) || 'low';

  const recommendations: string[] = [];
  if (highRiskAdapters.length > 0) {
    recommendations.push(
      'High-risk adapters detected. Consider:',
      '  - Implementing additional safety policies',
      '  - Requiring approval for sensitive operations',
      '  - Enabling audit logging',
      '  - Using sandbox execution where possible'
    );
  }

  return {
    overallRisk,
    highRiskAdapters,
    recommendations: recommendations.length > 0 ? recommendations : undefined,
  };
}

/**
 * Get required permissions for tool adapters
 */
export function getRequiredPermissions(
  toolAdapterNames: string[]
): string[] {
  const permissions = new Set<string>();
  
  toolAdapterNames.forEach((name) => {
    const adapter = CommonToolAdapters[name];
    if (adapter && adapter.requiredPermissions) {
      adapter.requiredPermissions.forEach((perm) => permissions.add(perm));
    }
  });

  return Array.from(permissions);
}
