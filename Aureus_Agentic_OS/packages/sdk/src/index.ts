/**
 * SDK for Aureus Agentic OS
 * Provides unified interface for building agent applications
 */

/**
 * Agent configuration
 */
export interface AgentConfig {
  id: string;
  name: string;
  description?: string;
  capabilities?: string[];
}

/**
 * Agent runtime interface
 */
export interface AgentRuntime {
  config: AgentConfig;
  
  // Core methods
  initialize(): Promise<void>;
  execute(task: unknown): Promise<unknown>;
  shutdown(): Promise<void>;
}

/**
 * SDK builder for creating agent applications
 */
export class AureusSDK {
  private config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  /**
   * Create an agent runtime
   */
  createRuntime(): AgentRuntime {
    return {
      config: this.config,
      
      async initialize() {
        console.log(`Initializing agent: ${this.config.name}`);
      },
      
      async execute(task: unknown) {
        console.log(`Executing task for agent: ${this.config.name}`);
        return { result: 'success', task };
      },
      
      async shutdown() {
        console.log(`Shutting down agent: ${this.config.name}`);
      },
    };
  }

  /**
   * Get agent configuration
   */
  getConfig(): AgentConfig {
    return { ...this.config };
  }
}

// Export Tool Adapter SDK
export * from './tool-adapter-sdk';
