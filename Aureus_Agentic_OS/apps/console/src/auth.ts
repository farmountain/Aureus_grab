import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import { AuthCredentials, AuthToken, OperatorSession } from './types';

/**
 * Simple authentication service for console operations with tenant isolation
 * In production, this should integrate with proper identity management
 */
export class AuthService {
  private users: Map<string, { passwordHash: string; permissions: string[]; tenantId?: string }> = new Map();
  private sessions: Map<string, OperatorSession> = new Map();
  private jwtSecret: string;
  private initialized: boolean = false;

  constructor(jwtSecret?: string) {
    this.jwtSecret = jwtSecret || crypto.randomBytes(32).toString('hex');
  }

  /**
   * Initialize the auth service (call this before using)
   */
  async initialize(): Promise<void> {
    if (!this.initialized) {
      await this.initializeDefaultUser();
      this.initialized = true;
    }
  }

  /**
   * Initialize default user for demo/testing
   */
  private async initializeDefaultUser() {
    const passwordHash = await bcrypt.hash('operator123', 10);
    this.users.set('operator', {
      passwordHash,
      permissions: ['read', 'write', 'approve', 'deny', 'rollback', 'deploy', 'devops_approve', 'devops_reject', 'devops_promote'],
      tenantId: undefined, // Default user has no tenant restriction (admin)
    });
  }

  /**
   * Authenticate user and return session token
   */
  async authenticate(credentials: AuthCredentials): Promise<AuthToken | null> {
    // Ensure initialized
    await this.initialize();

    const user = this.users.get(credentials.username);
    if (!user) {
      return null;
    }

    const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
    if (!isValid) {
      return null;
    }

    // Generate JWT token
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour
    const token = jwt.sign(
      { 
        username: credentials.username, 
        permissions: user.permissions,
        tenantId: user.tenantId 
      },
      this.jwtSecret,
      { expiresIn: '1h' }
    );

    // Store session
    const session: OperatorSession = {
      username: credentials.username,
      authenticated: true,
      token,
      permissions: user.permissions,
      tenantId: user.tenantId,
    };
    this.sessions.set(token, session);

    return { token, expiresAt };
  }

  /**
   * Validate token and return session
   */
  validateToken(token: string): OperatorSession | null {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as any;
      const session = this.sessions.get(token);
      
      if (!session) {
        return null;
      }

      return session;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if session has required permission
   */
  hasPermission(session: OperatorSession, permission: string): boolean {
    return session.permissions.includes(permission);
  }

  /**
   * Add a new user (for testing/admin purposes)
   */
  async addUser(username: string, password: string, permissions: string[], tenantId?: string): Promise<void> {
    const passwordHash = await bcrypt.hash(password, 10);
    this.users.set(username, { passwordHash, permissions, tenantId });
  }

  /**
   * Logout and invalidate session
   */
  logout(token: string): void {
    this.sessions.delete(token);
  }
}
