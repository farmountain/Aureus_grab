import {
  FileSystemEventLog,
  PostgresStateStore,
  SandboxIntegration,
  StateStore,
  EventLog,
  DatabaseConfig,
} from '@aureus/kernel';
import {
  AnySinkConfig,
  SinkManager,
  TelemetryCollector,
} from '@aureus/observability';
import { LLMProvider } from '../llm-provider';
import { OpenAIConfig, OpenAIProvider } from '../llm-providers/openai-provider';

export interface NamedTelemetrySink {
  name: string;
  config: AnySinkConfig;
}

export interface ProductionConsoleConfigOptions {
  database?: DatabaseConfig;
  eventLogDir?: string;
  telemetrySinks?: NamedTelemetrySink[];
  telemetryCorrelationId?: string;
  llmConfig?: Partial<OpenAIConfig>;
  stateStoreSchemaSQL?: string;
}

export interface ProductionConsoleConfig {
  stateStore: StateStore;
  eventLog: EventLog;
  telemetry: TelemetryCollector;
  telemetrySinks: SinkManager;
  sandboxIntegration: SandboxIntegration;
  llmProvider: LLMProvider;
}

const DEFAULT_EVENT_LOG_DIR = '/var/log/aureus/events';
const DEFAULT_LLM_MODEL = 'gpt-4';

const parseNumber = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const parseBoolean = (value: string | undefined): boolean | undefined => {
  if (value === undefined) {
    return undefined;
  }

  return value.toLowerCase() === 'true';
};

function buildTelemetrySinksFromEnv(): NamedTelemetrySink[] {
  const sinks: NamedTelemetrySink[] = [];

  const otelEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || process.env.TELEMETRY_ENDPOINT;
  if (otelEndpoint) {
    sinks.push({
      name: 'opentelemetry',
      config: {
        type: 'opentelemetry',
        enabled: true,
        options: {
          endpoint: otelEndpoint,
          protocol: process.env.OTEL_EXPORTER_OTLP_PROTOCOL as 'grpc' | 'http' | undefined,
          headers: process.env.OTEL_EXPORTER_OTLP_HEADERS
            ? JSON.parse(process.env.OTEL_EXPORTER_OTLP_HEADERS)
            : undefined,
          compression: parseBoolean(process.env.OTEL_EXPORTER_OTLP_COMPRESSION),
          serviceName: process.env.OTEL_SERVICE_NAME || process.env.TELEMETRY_SERVICE_NAME || 'aureus-console',
          serviceVersion: process.env.SERVICE_VERSION,
        },
      },
    });
  }

  const telemetryLogPath = process.env.TELEMETRY_LOG_PATH || process.env.TELEMETRY_FILE_PATH;
  if (telemetryLogPath) {
    sinks.push({
      name: 'file',
      config: {
        type: 'file',
        enabled: true,
        options: {
          path: telemetryLogPath,
        },
      },
    });
  }

  const metricsPort = parseNumber(process.env.PROMETHEUS_PORT) ?? parseNumber(process.env.METRICS_PORT);
  if (metricsPort) {
    sinks.push({
      name: 'prometheus',
      config: {
        type: 'prometheus',
        enabled: true,
        options: {
          port: metricsPort,
          path: process.env.PROMETHEUS_PATH || process.env.METRICS_PATH || '/metrics',
          prefix: process.env.PROMETHEUS_PREFIX,
        },
      },
    });
  }

  if (sinks.length === 0) {
    sinks.push({
      name: 'console',
      config: {
        type: 'console',
        enabled: true,
        options: {
          pretty: true,
          colors: true,
        },
      },
    });
  }

  return sinks;
}

function createOpenAIProvider(config: Partial<OpenAIConfig> = {}): OpenAIProvider {
  const envConfig: OpenAIConfig = {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.LLM_MODEL || DEFAULT_LLM_MODEL,
    maxTokens: parseNumber(process.env.LLM_MAX_TOKENS),
    temperature: parseNumber(process.env.LLM_TEMPERATURE),
    timeoutMs: parseNumber(process.env.LLM_TIMEOUT_MS),
    maxRetries: parseNumber(process.env.LLM_MAX_RETRIES),
    retryDelayMs: parseNumber(process.env.LLM_RETRY_DELAY_MS),
    baseURL: process.env.OPENAI_BASE_URL,
    organization: process.env.OPENAI_ORGANIZATION,
  };

  return new OpenAIProvider({
    ...envConfig,
    ...config,
    model: config.model || envConfig.model,
  });
}

export async function createProductionConsoleConfig(
  options: ProductionConsoleConfigOptions = {}
): Promise<ProductionConsoleConfig> {
  const stateStore = new PostgresStateStore(options.database);

  if (options.stateStoreSchemaSQL) {
    await stateStore.initialize(options.stateStoreSchemaSQL);
  }

  const eventLogDir = options.eventLogDir || process.env.EVENT_LOG_DIR || DEFAULT_EVENT_LOG_DIR;
  const eventLog = new FileSystemEventLog(eventLogDir);

  const sinkManager = new SinkManager();
  const telemetrySinks = options.telemetrySinks || buildTelemetrySinksFromEnv();
  telemetrySinks.forEach(({ name, config }) => sinkManager.addSink(name, config));

  const telemetry = new TelemetryCollector(sinkManager, options.telemetryCorrelationId);
  const sandboxIntegration = new SandboxIntegration(telemetry);
  const llmProvider = createOpenAIProvider(options.llmConfig);

  return {
    stateStore,
    eventLog,
    telemetry,
    telemetrySinks: sinkManager,
    sandboxIntegration,
    llmProvider,
  };
}
