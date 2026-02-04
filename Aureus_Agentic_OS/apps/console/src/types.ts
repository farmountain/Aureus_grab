import { WorkflowState, TaskState, Event, WorkflowVersion, Deployment, DeploymentEnvironment, DeploymentStatus, TestResult } from '@aureus/kernel';
import { GuardDecision, AuditEntry } from '@aureus/policy';
import { GateResult } from '@aureus/crv';

/**
 * Console-specific types for the operator interface
 */

export interface WorkflowStatus {
  workflowId: string;
  name?: string;
  status: WorkflowState['status'];
  startedAt?: Date;
  completedAt?: Date;
  tasks: TaskStatusSummary[];
  currentStep?: string;
  crvStatus?: CRVStatus;
  policyStatus?: PolicyStatus;
}

export interface TaskStatusSummary {
  taskId: string;
  name?: string;
  status: TaskState['status'];
  attempt: number;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  requiresApproval?: boolean;
  approvalToken?: string;
}

export interface CRVStatus {
  lastCheck?: Date;
  status: 'passed' | 'failed' | 'pending' | 'none';
  gateName?: string;
  details?: string;
}

export interface PolicyStatus {
  status: 'approved' | 'rejected' | 'pending' | 'none';
  requiresHumanApproval: boolean;
  approvalToken?: string;
  reason?: string;
}

export interface TimelineEntry {
  timestamp: Date;
  type: string;
  workflowId: string;
  taskId?: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export interface ApprovalRequest {
  workflowId: string;
  taskId: string;
  approvalToken: string;
}

export interface DenyRequest {
  workflowId: string;
  taskId: string;
  approvalToken: string;
  reason: string;
}

export interface RollbackRequest {
  workflowId: string;
  snapshotId: string;
  reason?: string;
}

export interface AuthCredentials {
  username: string;
  password: string;
}

export interface AuthToken {
  token: string;
  expiresAt: Date;
}

export interface OperatorSession {
  username: string;
  authenticated: boolean;
  token?: string;
  permissions: string[];
  tenantId?: string; // Optional tenant identifier for multi-tenancy
}

/**
 * Deployment-specific types
 */

export interface DeploymentVersionRequest {
  workflowSpec: any; // WorkflowSpec
  version: string;
  createdBy: string;
  metadata?: Record<string, unknown>;
}

export interface DeploymentCreateRequest {
  versionId: string;
  environment: DeploymentEnvironment;
  deployedBy: string;
  metadata?: Record<string, unknown>;
}

export interface DeploymentApprovalRequest {
  deploymentId: string;
  approver: string;
  riskTier: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  approvalToken: string;
  comment?: string;
}

export interface DeploymentRejectRequest {
  deploymentId: string;
  rejectedBy: string;
  reason: string;
}

export interface DeploymentCompleteRequest {
  deploymentId: string;
  deployedBy: string;
}

export interface DeploymentPromoteRequest {
  stagingDeploymentId: string;
  promotedBy: string;
}

export interface DeploymentSummary {
  deployment: Deployment;
  version: WorkflowVersion;
  requiresApproval: boolean;
  testsPassed: boolean;
  canPromote: boolean;
}

export interface SmokeTestRequest {
  deploymentId: string;
  tests: Array<{
    name: string;
    workflowId: string;
    expectedOutcome?: string;
  }>;
}

/**
 * DevOps-specific types
 */

export interface GateStatus {
  gateName: string;
  status: 'passed' | 'failed' | 'pending' | 'unknown';
  lastCheck: Date;
  details: {
    crvStatus?: {
      passed: boolean;
      validatorResults: Array<{
        name: string;
        passed: boolean;
        message?: string;
      }>;
    };
    policyStatus?: {
      allowed: boolean;
      requiresApproval: boolean;
      reason?: string;
    };
    testStatus?: {
      passed: number;
      failed: number;
      total: number;
      coverage?: number;
    };
  };
}

export interface IncidentSummary {
  total: number;
  active: number;
  resolved: number;
  critical: number;
  incidents: Array<{
    id: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    status: 'active' | 'investigating' | 'resolved';
    title: string;
    workflowId?: string;
    startedAt: Date;
    resolvedAt?: Date;
    affectedComponents: string[];
  }>;
}

export interface ReleaseHealth {
  overallStatus: 'healthy' | 'degraded' | 'critical';
  deployments: {
    total: number;
    successful: number;
    failed: number;
    pending: number;
  };
  metrics: {
    successRate: number;
    averageDeployTime: number;
    mttr: number; // Mean time to recovery
    changeFailureRate: number;
  };
  recentDeployments: Array<{
    id: string;
    environment: DeploymentEnvironment;
    status: DeploymentStatus;
    version: string;
    deployedAt: Date;
    health: 'healthy' | 'degraded' | 'failed';
  }>;
}

export interface DeploymentPipeline {
  id: string;
  name: string;
  workflowId: string;
  version: string;
  stages: Array<{
    name: string;
    status: 'pending' | 'running' | 'passed' | 'failed' | 'blocked';
    startedAt?: Date;
    completedAt?: Date;
    approvals?: Array<{
      required: boolean;
      approver?: string;
      approvedAt?: Date;
      comment?: string;
    }>;
    gates?: GateStatus[];
  }>;
  currentStage?: string;
  overallStatus: 'pending' | 'running' | 'passed' | 'failed' | 'blocked';
}
