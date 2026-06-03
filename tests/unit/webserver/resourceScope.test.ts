import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canManageScopedResource,
  getTeamPeerUserIds,
  normalizeResourceScope,
  resolveResourceScope,
  VISIBLE_RESOURCE_WHERE,
} from '@process/webserver/routes/resourceScope';

vi.mock('@process/webserver/auth/enterpriseRoles', () => ({
  isEnterpriseAdminRole: (role?: string) => role === 'org_admin',
}));

function createDriver(memberships: Array<{ team_id: string; role?: string; peer_id?: string }> = []) {
  return {
    prepare: vi.fn((sql: string) => ({
      get: vi.fn((...args: unknown[]) => {
        if (sql.includes('team_memberships') && sql.includes('SELECT 1')) {
          const teamId = args[1];
          return memberships.some((item) => item.team_id === teamId) ? { 1: 1 } : undefined;
        }
        if (sql.includes('SELECT role FROM team_memberships')) {
          const teamId = args[1];
          const row = memberships.find((item) => item.team_id === teamId);
          return row ? { role: row.role ?? 'member' } : undefined;
        }
        return undefined;
      }),
      all: vi.fn(() => {
        if (sql.includes('SELECT DISTINCT m2.user_id')) {
          if (memberships.length === 0) {
            return [];
          }
          return [
            { user_id: 'user-1' },
            { user_id: memberships[0]?.peer_id ?? 'user-2' },
          ];
        }
        return [];
      }),
    })),
  };
}

function createRequest(role = 'member'): Request {
  return {
    user: { id: 'user-1', role, tenant_id: 'tenant-1' },
  } as Request;
}

describe('resourceScope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('falls back to personal when non-admin requests organization scope', () => {
    const driver = createDriver();
    const result = resolveResourceScope(createRequest('member'), driver, 'tenant-1', {
      scope: 'organization',
    });
    expect(result).toEqual({ scope: 'personal', teamId: null });
  });

  it('allows admin to create organization scope', () => {
    const driver = createDriver();
    const result = resolveResourceScope(createRequest('org_admin'), driver, 'tenant-1', {
      scope: 'organization',
    });
    expect(result).toEqual({ scope: 'organization', teamId: null });
  });

  it('normalizes legacy organization scope aliases', () => {
    expect(normalizeResourceScope('tenant')).toBe('organization');
    expect(normalizeResourceScope('org')).toBe('organization');
    expect(normalizeResourceScope('organization')).toBe('organization');
    expect(resolveResourceScope(createRequest('org_admin'), createDriver(), 'tenant-1', { scope: 'tenant' })).toEqual({
      scope: 'organization',
      teamId: null,
    });
  });

  it('requires team_id for team scope', () => {
    const driver = createDriver([{ team_id: 'team-1' }]);
    const result = resolveResourceScope(createRequest('member'), driver, 'tenant-1', {
      scope: 'team',
    });
    expect(result).toEqual({ error: 'team_id is required for team scope', status: 400 });
  });

  it('rejects team scope when user is not a member', () => {
    const driver = createDriver();
    const result = resolveResourceScope(createRequest('member'), driver, 'tenant-1', {
      scope: 'team',
      team_id: 'team-1',
    });
    expect(result).toEqual({ error: 'Not a member of this team', status: 403 });
  });

  it('allows team scope for team members', () => {
    const driver = createDriver([{ team_id: 'team-1' }]);
    const result = resolveResourceScope(createRequest('member'), driver, 'tenant-1', {
      scope: 'team',
      team_id: 'team-1',
    });
    expect(result).toEqual({ scope: 'team', teamId: 'team-1' });
  });

  it('allows team owner/admin to manage team resources they did not create', () => {
    const driver = createDriver([{ team_id: 'team-1', role: 'admin' }]);
    const allowed = canManageScopedResource(createRequest('member'), driver, 'tenant-1', {
      scope: 'team',
      team_id: 'team-1',
      created_by: 'other-user',
    });
    expect(allowed).toBe(true);
  });

  it('includes team membership subquery in visibility filter', () => {
    expect(VISIBLE_RESOURCE_WHERE).toContain('team_memberships');
    expect(VISIBLE_RESOURCE_WHERE).toContain("scope = 'team'");
    expect(VISIBLE_RESOURCE_WHERE).toContain("'tenant'");
  });

  it('returns self when user has no team memberships', () => {
    const driver = createDriver([]);
    const peerIds = getTeamPeerUserIds(driver, 'tenant-1', 'user-1');
    expect(peerIds).toEqual(['user-1']);
  });

  it('returns distinct team peer user ids', () => {
    const driver = createDriver([{ team_id: 'team-1' }, { team_id: 'team-2' }]);
    const peerIds = getTeamPeerUserIds(driver, 'tenant-1', 'user-1');
    expect(peerIds).toContain('user-1');
  });
});
