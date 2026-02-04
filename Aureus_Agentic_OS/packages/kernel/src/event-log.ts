import * as fs from 'fs';
import * as path from 'path';
import { Event, EventLog } from './types';

/**
 * FileSystemEventLog implements an append-only event log using the file system with tenant isolation
 * Events are written to ./var/run/<workflowId>/events.log
 */
export class FileSystemEventLog implements EventLog {
  private baseDir: string;

  constructor(baseDir: string = './var/run') {
    this.baseDir = baseDir;
  }

  async append(event: Event): Promise<void> {
    const logDir = path.join(this.baseDir, event.workflowId);
    const logFile = path.join(logDir, 'events.log');

    // Ensure directory exists
    await fs.promises.mkdir(logDir, { recursive: true });

    // Append event as JSON line
    const eventLine = JSON.stringify({
      ...event,
      timestamp: event.timestamp.toISOString(),
    }) + '\n';

    await fs.promises.appendFile(logFile, eventLine, 'utf-8');
  }

  async read(workflowId: string, tenantId?: string): Promise<Event[]> {
    const logFile = path.join(this.baseDir, workflowId, 'events.log');

    try {
      const content = await fs.promises.readFile(logFile, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.length > 0);
      
      const events = lines.map(line => {
        const parsed = JSON.parse(line);
        return {
          ...parsed,
          timestamp: new Date(parsed.timestamp),
        };
      });

      // Tenant isolation: filter events by tenant
      if (tenantId) {
        // Strict filtering: only return events that explicitly match the tenantId
        return events.filter(e => e.tenantId === tenantId);
      }

      return events;
    } catch (error) {
      // File doesn't exist yet or other error
      if (error && typeof error === 'object' && 'code' in error && (error as any).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Read all events for a specific tenant across all workflows
   */
  async readByTenant(tenantId: string): Promise<Event[]> {
    const events: Event[] = [];
    
    try {
      const workflowDirs = await fs.promises.readdir(this.baseDir);
      
      for (const workflowId of workflowDirs) {
        const workflowEvents = await this.read(workflowId, tenantId);
        events.push(...workflowEvents);
      }
    } catch (error) {
      // Base directory doesn't exist yet
      if (error && typeof error === 'object' && 'code' in error && (error as any).code === 'ENOENT') {
        return [];
      }
      throw error;
    }

    return events;
  }

  /**
   * Export events for compliance (e.g., audit trail export)
   */
  async exportEvents(tenantId: string, startDate?: Date, endDate?: Date): Promise<Event[]> {
    const allEvents = await this.readByTenant(tenantId);
    
    // Filter by date range if provided
    return allEvents.filter(event => {
      if (startDate && event.timestamp < startDate) return false;
      if (endDate && event.timestamp > endDate) return false;
      return true;
    });
  }
}

/**
 * InMemoryEventLog provides a simple in-memory implementation for testing with tenant isolation
 */
export class InMemoryEventLog implements EventLog {
  private events: Event[] = [];

  async append(event: Event): Promise<void> {
    this.events.push(event);
  }

  async read(workflowId: string, tenantId?: string): Promise<Event[]> {
    const workflowEvents = this.events.filter(e => e.workflowId === workflowId);
    
    // Tenant isolation: filter events by tenant
    if (tenantId) {
      // Strict filtering: only return events that explicitly match the tenantId
      return workflowEvents.filter(e => e.tenantId === tenantId);
    }
    
    return workflowEvents;
  }

  /**
   * Read all events for a specific tenant across all workflows
   */
  async readByTenant(tenantId: string): Promise<Event[]> {
    return this.events.filter(e => e.tenantId === tenantId);
  }

  /**
   * Export events for compliance (e.g., audit trail export)
   */
  async exportEvents(tenantId: string, startDate?: Date, endDate?: Date): Promise<Event[]> {
    const tenantEvents = await this.readByTenant(tenantId);
    
    // Filter by date range if provided
    return tenantEvents.filter(event => {
      if (startDate && event.timestamp < startDate) return false;
      if (endDate && event.timestamp > endDate) return false;
      return true;
    });
  }

  // Helper for testing
  clear(): void {
    this.events = [];
  }
}
