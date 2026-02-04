/**
 * Example: Sandbox Execution Layer Usage
 * 
 * This example demonstrates how to use the sandbox execution layer
 * to run tools in constrained environments with explicit permissions.
 */

import {
  SandboxedToolWrapper,
  SandboxConfigFactory,
  SandboxExecutor,
  SandboxAuditLogger,
  EscalationManager,
  MockEscalationHandler,
  SandboxConfig,
  SandboxType,
  FileTool,
  HTTPTool,
  InMemoryToolResultCache,
} from '@aureus/tools';
import { GoalGuardFSM, Principal, RiskTier } from '@aureus/policy';
import { CRVGate, Validators } from '@aureus/crv';
import { TelemetryCollector } from '@aureus/observability';

async function example1_BasicSandboxExecution() {
  console.log('\n=== Example 1: Basic Sandbox Execution ===\n');

  // Setup sandbox infrastructure
  const auditLogger = new SandboxAuditLogger();
  const executor = new SandboxExecutor(auditLogger);

  // Create a restrictive sandbox configuration
  const sandboxConfig = SandboxConfigFactory.createRestrictive('basic-sandbox');

  // Create a file tool with sandbox
  const fileTool = FileTool.createReadTool();
  const wrapper = new SandboxedToolWrapper(fileTool, sandboxConfig);

  // Execute in sandbox
  const result = await wrapper.execute(
    { path: '/tmp/test.txt', encoding: 'utf-8' },
    {
      workflowId: 'workflow-1',
      taskId: 'task-1',
      stepId: 'step-1',
      sandboxExecutor: executor,
      sandboxAuditLogger: auditLogger,
      cache: new InMemoryToolResultCache(),
    }
  );

  console.log('Execution result:', result);
  console.log('Audit log entries:', auditLogger.getAuditLog().length);
}

async function example2_PermissionEnforcement() {
  console.log('\n=== Example 2: Permission Enforcement ===\n');

  const auditLogger = new SandboxAuditLogger();
  const executor = new SandboxExecutor(auditLogger);

  // Restrictive config: network disabled, limited filesystem access
  const sandboxConfig = SandboxConfigFactory.createRestrictive('restrictive');

  const httpTool = HTTPTool.createGetTool();
  const wrapper = new SandboxedToolWrapper(httpTool, sandboxConfig);

  // This will be denied - network is disabled in restrictive config
  const result = await wrapper.execute(
    { url: 'https://api.example.com/data' },
    {
      workflowId: 'workflow-2',
      taskId: 'task-1',
      stepId: 'step-1',
      sandboxExecutor: executor,
      sandboxAuditLogger: auditLogger,
      cache: new InMemoryToolResultCache(),
    }
  );

  console.log('Network access denied:', !result.success);
  console.log('Error:', result.error);

  // Check audit log for permission denial
  const denials = auditLogger.getAuditLogByType('permission_denied' as any);
  console.log('Permission denials logged:', denials.length);
}

async function example3_PolicyGuardedEscalation() {
  console.log('\n=== Example 3: Policy-Guarded Escalation ===\n');

  const telemetry = new TelemetryCollector();
  const auditLogger = new SandboxAuditLogger(telemetry);
  const executor = new SandboxExecutor(auditLogger);

  // Setup policy guard
  const policyGuard = new GoalGuardFSM();

  // Auto-approve escalation handler for demo
  const escalationHandler = new MockEscalationHandler(true);
  const escalationManager = new EscalationManager(
    escalationHandler,
    policyGuard,
    auditLogger
  );

  const sandboxConfig = SandboxConfigFactory.createRestrictive('escalation-demo');

  const fileTool = FileTool.createWriteTool();
  const wrapper = new SandboxedToolWrapper(fileTool, sandboxConfig);

  // Define principal (user/agent)
  const principal: Principal = {
    id: 'agent-1',
    type: 'agent',
    permissions: [
      { action: 'write', resource: 'tool' }
    ],
  };

  // Try to write to a path not in allowed list
  // This will trigger escalation
  const result = await wrapper.execute(
    { path: '/home/user/data.txt', content: 'Hello, World!' },
    {
      workflowId: 'workflow-3',
      taskId: 'task-1',
      stepId: 'step-1',
      sandboxExecutor: executor,
      sandboxAuditLogger: auditLogger,
      escalationManager,
      principal,
      cache: new InMemoryToolResultCache(),
    }
  );

  console.log('Execution with escalation:', result.success);
  
  // Check escalation logs
  const escalations = auditLogger.getAuditLogByType('escalation_requested' as any);
  console.log('Escalations requested:', escalations.length);
}

async function example4_CustomSandboxConfig() {
  console.log('\n=== Example 4: Custom Sandbox Configuration ===\n');

  const auditLogger = new SandboxAuditLogger();
  const executor = new SandboxExecutor(auditLogger);

  // Create custom sandbox configuration
  const customConfig: SandboxConfig = {
    id: 'custom-api-sandbox',
    type: SandboxType.MOCK,
    permissions: {
      filesystem: {
        readOnlyPaths: ['/app/config'],
        readWritePaths: ['/app/data'],
        deniedPaths: ['/app/secrets'],
        maxDiskUsage: 100 * 1024 * 1024, // 100 MB
        maxFileCount: 500,
      },
      network: {
        enabled: true,
        allowedDomains: ['api.example.com', '*.trusted-api.com'],
        allowedPorts: [443],
        deniedDomains: ['malicious.com'],
        maxBandwidth: 5 * 1024 * 1024, // 5 MB/s
      },
      resources: {
        maxCpu: 1.5,
        maxMemory: 512 * 1024 * 1024, // 512 MB
        maxExecutionTime: 45000, // 45 seconds
        maxProcesses: 15,
      },
      capabilities: [],
      allowedEnvVars: ['PATH', 'API_KEY'],
    },
    workDir: '/app',
    persistent: false,
  };

  const httpTool = HTTPTool.createGetTool();
  const wrapper = new SandboxedToolWrapper(httpTool, customConfig);

  // This will succeed - api.example.com is in allowed domains
  const result = await wrapper.execute(
    { url: 'https://api.example.com/v1/users' },
    {
      workflowId: 'workflow-4',
      taskId: 'task-1',
      stepId: 'step-1',
      sandboxExecutor: executor,
      sandboxAuditLogger: auditLogger,
      cache: new InMemoryToolResultCache(),
    }
  );

  console.log('Custom config execution:', result.success);
}

async function example5_IntegrationWithPolicyAndCRV() {
  console.log('\n=== Example 5: Full Integration (Sandbox + Policy + CRV) ===\n');

  const telemetry = new TelemetryCollector();
  const auditLogger = new SandboxAuditLogger(telemetry);
  const executor = new SandboxExecutor(auditLogger);
  const policyGuard = new GoalGuardFSM();
  const escalationHandler = new MockEscalationHandler(false);
  const escalationManager = new EscalationManager(
    escalationHandler,
    policyGuard,
    auditLogger
  );

  const sandboxConfig = SandboxConfigFactory.createStandard('integrated-sandbox');

  const fileTool = FileTool.createWriteTool();
  const wrapper = new SandboxedToolWrapper(fileTool, sandboxConfig);

  // Setup CRV gate
  const crvGate = new CRVGate({
    name: 'File Write CRV',
    validators: [
      Validators.notNull(),
      Validators.schema({
        path: 'string',
        content: 'string',
      }),
    ],
    blockOnFailure: true,
  });

  // Setup principal and action
  const principal: Principal = {
    id: 'user-1',
    type: 'user',
    permissions: [
      { action: 'write', resource: 'tool' }
    ],
  };

  const action = {
    id: 'file-write',
    name: 'Write File',
    riskTier: RiskTier.MEDIUM,
    requiredPermissions: [
      { action: 'write', resource: 'tool' }
    ],
    allowedTools: ['Write File'],
  };

  // Execute with full safety
  const result = await wrapper.execute(
    {
      path: '/tmp/sandbox/output.txt',
      content: 'Secure data',
      createDirectories: true,
    },
    {
      workflowId: 'workflow-5',
      taskId: 'task-1',
      stepId: 'step-1',
      sandboxExecutor: executor,
      sandboxAuditLogger: auditLogger,
      escalationManager,
      principal,
      action,
      policyGuard,
      crvGate,
      cache: new InMemoryToolResultCache(),
      telemetry,
    }
  );

  console.log('Full integration execution:', result.success);
  console.log('Telemetry events:', telemetry.getEvents().length);
  console.log('Audit log entries:', auditLogger.getAuditLog().length);
}

async function example6_AuditLogQuerying() {
  console.log('\n=== Example 6: Audit Log Querying ===\n');

  const auditLogger = new SandboxAuditLogger();
  const executor = new SandboxExecutor(auditLogger);

  const sandboxConfig = SandboxConfigFactory.createStandard('audit-demo');
  const fileTool = FileTool.createReadTool();
  const wrapper = new SandboxedToolWrapper(fileTool, sandboxConfig);

  // Execute multiple operations
  for (let i = 0; i < 5; i++) {
    await wrapper.execute(
      { path: `/tmp/file${i}.txt` },
      {
        workflowId: 'workflow-6',
        taskId: `task-${i}`,
        stepId: 'step-1',
        sandboxExecutor: executor,
        sandboxAuditLogger: auditLogger,
        cache: new InMemoryToolResultCache(),
      }
    );
  }

  // Query audit logs
  console.log('Total audit entries:', auditLogger.getAuditLog().length);
  
  const workflowLogs = auditLogger.getAuditLogByWorkflow('workflow-6');
  console.log('Workflow-specific logs:', workflowLogs.length);

  const creationLogs = auditLogger.getAuditLogByType('sandbox_created' as any);
  console.log('Sandbox creations:', creationLogs.length);

  const executionLogs = auditLogger.getAuditLogByType('tool_execution_end' as any);
  console.log('Tool executions:', executionLogs.length);

  // Export logs
  const jsonLogs = auditLogger.exportToJSON();
  console.log('Exported JSON length:', jsonLogs.length, 'characters');
}

async function example7_ResourceLimits() {
  console.log('\n=== Example 7: Resource Limits ===\n');

  const auditLogger = new SandboxAuditLogger();
  const executor = new SandboxExecutor(auditLogger);

  // Create sandbox with very tight limits
  const tightConfig: SandboxConfig = {
    id: 'tight-limits',
    type: SandboxType.MOCK,
    permissions: {
      filesystem: {},
      network: { enabled: false },
      resources: {
        maxCpu: 0.1, // Very low
        maxMemory: 1024, // 1 KB
        maxExecutionTime: 10, // 10 ms
        maxProcesses: 1,
      },
    },
  };

  const fileTool = FileTool.createReadTool();
  const wrapper = new SandboxedToolWrapper(fileTool, tightConfig);

  // Execute multiple times to hit resource limits
  let limitExceeded = false;
  for (let i = 0; i < 10; i++) {
    const result = await wrapper.execute(
      { path: `/tmp/file${i}.txt` },
      {
        workflowId: 'workflow-7',
        taskId: `task-${i}`,
        stepId: 'step-1',
        sandboxExecutor: executor,
        sandboxAuditLogger: auditLogger,
        cache: new InMemoryToolResultCache(),
      }
    );

    if (!result.success && result.metadata?.resourceLimitExceeded) {
      console.log('Resource limit exceeded:', result.error);
      limitExceeded = true;
      break;
    }
  }

  console.log('Demonstrated resource limits:', limitExceeded);
}

// Main execution
async function main() {
  try {
    await example1_BasicSandboxExecution();
    await example2_PermissionEnforcement();
    await example3_PolicyGuardedEscalation();
    await example4_CustomSandboxConfig();
    await example5_IntegrationWithPolicyAndCRV();
    await example6_AuditLogQuerying();
    await example7_ResourceLimits();

    console.log('\n=== All Examples Completed ===\n');
  } catch (error) {
    console.error('Example error:', error);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export {
  example1_BasicSandboxExecution,
  example2_PermissionEnforcement,
  example3_PolicyGuardedEscalation,
  example4_CustomSandboxConfig,
  example5_IntegrationWithPolicyAndCRV,
  example6_AuditLogQuerying,
  example7_ResourceLimits,
};
