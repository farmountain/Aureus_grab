#!/usr/bin/env node

import { ConsoleService } from './console-service';
import { WorkflowStatus, TimelineEntry } from './types';

/**
 * CLI Interface for the Aureus Console
 * Provides a text-based interface for monitoring and controlling workflows
 */
export class ConsoleCLI {
  private consoleService: ConsoleService;

  constructor(consoleService: ConsoleService) {
    this.consoleService = consoleService;
  }

  /**
   * Display all workflows
   */
  async displayWorkflows(): Promise<void> {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('                     AUREUS CONSOLE                             ');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const workflows = await this.consoleService.listWorkflows();

    if (workflows.length === 0) {
      console.log('No workflows found.\n');
      return;
    }

    for (const workflow of workflows) {
      this.displayWorkflowSummary(workflow);
    }
  }

  /**
   * Display detailed workflow status
   */
  async displayWorkflowDetail(workflowId: string): Promise<void> {
    const workflow = await this.consoleService.getWorkflowStatus(workflowId);

    if (!workflow) {
      console.log(`\nWorkflow ${workflowId} not found.\n`);
      return;
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`  Workflow: ${workflow.workflowId}`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Status
    console.log(`Status:        ${this.formatStatus(workflow.status)}`);
    console.log(`Started:       ${workflow.startedAt?.toLocaleString() || 'N/A'}`);
    console.log(`Completed:     ${workflow.completedAt?.toLocaleString() || 'N/A'}`);
    console.log(`Current Step:  ${workflow.currentStep || 'N/A'}`);
    console.log('');

    // CRV Status
    if (workflow.crvStatus) {
      console.log('─────────────────────────────────────────────────────────────');
      console.log('CRV Status:');
      console.log(`  Status:      ${this.formatCRVStatus(workflow.crvStatus.status)}`);
      if (workflow.crvStatus.gateName) {
        console.log(`  Gate:        ${workflow.crvStatus.gateName}`);
      }
      if (workflow.crvStatus.details) {
        console.log(`  Details:     ${workflow.crvStatus.details}`);
      }
      if (workflow.crvStatus.lastCheck) {
        console.log(`  Last Check:  ${workflow.crvStatus.lastCheck.toLocaleString()}`);
      }
      console.log('');
    }

    // Policy Status
    if (workflow.policyStatus) {
      console.log('─────────────────────────────────────────────────────────────');
      console.log('Policy Status:');
      console.log(`  Status:      ${this.formatPolicyStatus(workflow.policyStatus.status)}`);
      console.log(`  Requires Approval: ${workflow.policyStatus.requiresHumanApproval ? 'Yes' : 'No'}`);
      if (workflow.policyStatus.reason) {
        console.log(`  Reason:      ${workflow.policyStatus.reason}`);
      }
      if (workflow.policyStatus.approvalToken) {
        console.log(`  Token:       ${workflow.policyStatus.approvalToken}`);
      }
      console.log('');
    }

    // Tasks
    console.log('─────────────────────────────────────────────────────────────');
    console.log('Tasks:');
    console.log('');
    
    for (const task of workflow.tasks) {
      this.displayTaskStatus(task);
    }

    console.log('═══════════════════════════════════════════════════════════════\n');
  }

  /**
   * Display timeline for a workflow
   */
  async displayTimeline(workflowId: string, limit: number = 20): Promise<void> {
    const timeline = await this.consoleService.getTimeline(workflowId);

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`  Timeline: ${workflowId}`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    if (timeline.length === 0) {
      console.log('No events found.\n');
      return;
    }

    const displayEvents = timeline.slice(-limit).reverse();

    for (const entry of displayEvents) {
      this.displayTimelineEntry(entry);
    }

    if (timeline.length > limit) {
      console.log(`\n... and ${timeline.length - limit} more events`);
    }

    console.log('═══════════════════════════════════════════════════════════════\n');
  }

  /**
   * Display snapshots for a workflow
   */
  async displaySnapshots(workflowId: string): Promise<void> {
    const snapshots = await this.consoleService.getSnapshots(workflowId);

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`  Snapshots: ${workflowId}`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    if (snapshots.length === 0) {
      console.log('No snapshots found.\n');
      return;
    }

    for (const snapshot of snapshots) {
      console.log(`ID:        ${snapshot.id}`);
      console.log(`Timestamp: ${snapshot.timestamp.toLocaleString()}`);
      console.log(`Task:      ${snapshot.taskId}`);
      console.log(`Step:      ${snapshot.stepId}`);
      console.log(`Verified:  ${snapshot.verified ? '✓ Yes' : '✗ No'}`);
      console.log(`Hash:      ${snapshot.contentHash.substring(0, 16)}...`);
      console.log('');
    }

    console.log('═══════════════════════════════════════════════════════════════\n');
  }

  /**
   * Display workflow summary
   */
  private displayWorkflowSummary(workflow: WorkflowStatus): void {
    const statusIcon = this.getStatusIcon(workflow.status);
    const crvIcon = workflow.crvStatus ? this.getCRVIcon(workflow.crvStatus.status) : ' ';
    const policyIcon = workflow.policyStatus ? this.getPolicyIcon(workflow.policyStatus.status) : ' ';

    console.log(`${statusIcon} ${workflow.workflowId}`);
    console.log(`   Status: ${workflow.status.toUpperCase()}`);
    console.log(`   Current Step: ${workflow.currentStep || 'N/A'}`);
    console.log(`   Tasks: ${workflow.tasks.length} (${this.countTasksByStatus(workflow.tasks)})`);
    console.log(`   CRV: ${crvIcon}  Policy: ${policyIcon}`);
    
    // Show approval requirement
    const pendingApproval = workflow.tasks.find(t => t.requiresApproval);
    if (pendingApproval) {
      console.log(`   ⚠️  Requires Approval: ${pendingApproval.taskId}`);
      console.log(`       Token: ${pendingApproval.approvalToken}`);
    }
    
    console.log('');
  }

  /**
   * Display task status
   */
  private displayTaskStatus(task: any): void {
    const statusIcon = this.getStatusIcon(task.status);
    
    console.log(`  ${statusIcon} ${task.taskId}`);
    console.log(`     Status:   ${task.status}`);
    console.log(`     Attempts: ${task.attempt}`);
    
    if (task.startedAt) {
      console.log(`     Started:  ${task.startedAt.toLocaleString()}`);
    }
    
    if (task.completedAt) {
      console.log(`     Completed: ${task.completedAt.toLocaleString()}`);
    }
    
    if (task.error) {
      console.log(`     Error:    ${task.error}`);
    }
    
    if (task.requiresApproval) {
      console.log(`     ⚠️  Requires Approval`);
      console.log(`     Token:    ${task.approvalToken}`);
    }
    
    console.log('');
  }

  /**
   * Display timeline entry
   */
  private displayTimelineEntry(entry: TimelineEntry): void {
    const timestamp = entry.timestamp.toLocaleString();
    const taskInfo = entry.taskId ? ` [${entry.taskId}]` : '';
    console.log(`${timestamp}${taskInfo}: ${entry.description}`);
  }

  /**
   * Get status icon
   */
  private getStatusIcon(status: string): string {
    switch (status) {
      case 'completed': return '✓';
      case 'running': return '▶';
      case 'pending': return '○';
      case 'failed': return '✗';
      case 'retrying': return '↻';
      case 'timeout': return '⏱';
      default: return '?';
    }
  }

  /**
   * Get CRV status icon
   */
  private getCRVIcon(status: string): string {
    switch (status) {
      case 'passed': return '✓';
      case 'failed': return '✗';
      case 'pending': return '○';
      default: return '-';
    }
  }

  /**
   * Get policy status icon
   */
  private getPolicyIcon(status: string): string {
    switch (status) {
      case 'approved': return '✓';
      case 'rejected': return '✗';
      case 'pending': return '⚠';
      default: return '-';
    }
  }

  /**
   * Format status with color/style
   */
  private formatStatus(status: string): string {
    return status.toUpperCase();
  }

  /**
   * Format CRV status
   */
  private formatCRVStatus(status: string): string {
    return status.toUpperCase();
  }

  /**
   * Format policy status
   */
  private formatPolicyStatus(status: string): string {
    return status.toUpperCase();
  }

  /**
   * Count tasks by status
   */
  private countTasksByStatus(tasks: any[]): string {
    const completed = tasks.filter(t => t.status === 'completed').length;
    const running = tasks.filter(t => t.status === 'running').length;
    const failed = tasks.filter(t => t.status === 'failed').length;

    const parts: string[] = [];
    if (completed > 0) parts.push(`${completed} completed`);
    if (running > 0) parts.push(`${running} running`);
    if (failed > 0) parts.push(`${failed} failed`);

    return parts.join(', ') || 'none';
  }
}
