import { describe, it, expect, beforeEach } from 'vitest';
import { AuthService } from '../src/auth';

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
  });

  it('should authenticate valid credentials', async () => {
    const token = await authService.authenticate({
      username: 'operator',
      password: 'operator123',
    });

    expect(token).toBeDefined();
    expect(token?.token).toBeDefined();
    expect(token?.expiresAt).toBeInstanceOf(Date);
  });

  it('should reject invalid credentials', async () => {
    const token = await authService.authenticate({
      username: 'operator',
      password: 'wrongpassword',
    });

    expect(token).toBeNull();
  });

  it('should reject non-existent user', async () => {
    const token = await authService.authenticate({
      username: 'nonexistent',
      password: 'password',
    });

    expect(token).toBeNull();
  });

  it('should validate valid token', async () => {
    const authToken = await authService.authenticate({
      username: 'operator',
      password: 'operator123',
    });

    expect(authToken).toBeDefined();

    const session = authService.validateToken(authToken!.token);
    expect(session).toBeDefined();
    expect(session?.username).toBe('operator');
    expect(session?.authenticated).toBe(true);
    expect(session?.permissions).toContain('read');
    expect(session?.permissions).toContain('approve');
  });

  it('should reject invalid token', () => {
    const session = authService.validateToken('invalid-token');
    expect(session).toBeNull();
  });

  it('should check permissions correctly', async () => {
    const authToken = await authService.authenticate({
      username: 'operator',
      password: 'operator123',
    });

    const session = authService.validateToken(authToken!.token);
    expect(session).toBeDefined();

    expect(authService.hasPermission(session!, 'read')).toBe(true);
    expect(authService.hasPermission(session!, 'approve')).toBe(true);
    expect(authService.hasPermission(session!, 'invalid')).toBe(false);
  });

  it('should logout and invalidate token', async () => {
    const authToken = await authService.authenticate({
      username: 'operator',
      password: 'operator123',
    });

    expect(authToken).toBeDefined();

    authService.logout(authToken!.token);

    const session = authService.validateToken(authToken!.token);
    expect(session).toBeNull();
  });

  it('should add new user', async () => {
    await authService.addUser('testuser', 'testpass', ['read']);

    const token = await authService.authenticate({
      username: 'testuser',
      password: 'testpass',
    });

    expect(token).toBeDefined();

    const session = authService.validateToken(token!.token);
    expect(session?.username).toBe('testuser');
    expect(session?.permissions).toEqual(['read']);
  });

  describe('DevOps Role-Based Access', () => {
    it('should grant devops_approve permission to default operator', async () => {
      const token = await authService.authenticate({
        username: 'operator',
        password: 'operator123',
      });

      const session = authService.validateToken(token!.token);
      expect(session).toBeDefined();
      expect(authService.hasPermission(session!, 'devops_approve')).toBe(true);
    });

    it('should grant devops_reject permission to default operator', async () => {
      const token = await authService.authenticate({
        username: 'operator',
        password: 'operator123',
      });

      const session = authService.validateToken(token!.token);
      expect(session).toBeDefined();
      expect(authService.hasPermission(session!, 'devops_reject')).toBe(true);
    });

    it('should grant devops_promote permission to default operator', async () => {
      const token = await authService.authenticate({
        username: 'operator',
        password: 'operator123',
      });

      const session = authService.validateToken(token!.token);
      expect(session).toBeDefined();
      expect(authService.hasPermission(session!, 'devops_promote')).toBe(true);
    });

    it('should not grant devops permissions to user without them', async () => {
      await authService.addUser('devuser', 'devpass', ['read', 'write']);

      const token = await authService.authenticate({
        username: 'devuser',
        password: 'devpass',
      });

      const session = authService.validateToken(token!.token);
      expect(session).toBeDefined();
      expect(authService.hasPermission(session!, 'devops_approve')).toBe(false);
      expect(authService.hasPermission(session!, 'devops_reject')).toBe(false);
      expect(authService.hasPermission(session!, 'devops_promote')).toBe(false);
    });

    it('should grant selective devops permissions', async () => {
      await authService.addUser('approver', 'approverpass', ['read', 'devops_approve']);

      const token = await authService.authenticate({
        username: 'approver',
        password: 'approverpass',
      });

      const session = authService.validateToken(token!.token);
      expect(session).toBeDefined();
      expect(authService.hasPermission(session!, 'devops_approve')).toBe(true);
      expect(authService.hasPermission(session!, 'devops_reject')).toBe(false);
      expect(authService.hasPermission(session!, 'devops_promote')).toBe(false);
    });
  });
});
