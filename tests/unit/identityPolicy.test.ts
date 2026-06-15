import { describe, expect, it } from 'vitest';
import {
  createEditionGate,
  resolveIdentitySnapshot,
  type EditionCapability,
  type IdentityKind,
} from '@/common/auth/identityPolicy';

function expectCapabilities(kind: IdentityKind, capabilities: Record<EditionCapability, boolean>): void {
  const enabled = Object.entries(capabilities)
    .filter(([, value]) => value)
    .map(([capability]) => capability);
  const disabled = Object.entries(capabilities)
    .filter(([, value]) => !value)
    .map(([capability]) => capability);

  const gate = createEditionGate({
    identity: resolveIdentitySnapshot({
      user:
        kind === 'anonymous'
          ? null
          : {
              id: kind === 'desktop_operator' ? 'desktop-local-admin' : `${kind}-user`,
              username: kind,
              role: kind === 'enterprise_admin' ? 'org_admin' : kind === 'enterprise_member' ? 'member' : 'user',
              tenant_id: kind === 'enterprise_member' || kind === 'enterprise_admin' ? 'tenant-1' : 'default',
            },
      enterpriseContext:
        kind === 'enterprise_member' || kind === 'enterprise_admin'
          ? {
              joined: true,
              tenantId: 'tenant-1',
              tenantName: 'Acme',
              role: kind === 'enterprise_admin' ? 'org_admin' : 'member',
            }
          : { joined: false, tenantId: 'default', tenantName: null },
      managementMode: kind === 'enterprise_member' || kind === 'enterprise_admin' ? 'enterprise' : 'standalone',
    }),
  });

  for (const capability of enabled) {
    expect(gate.can(capability as EditionCapability), `${kind} enables ${capability}`).toBe(true);
  }
  for (const capability of disabled) {
    expect(gate.can(capability as EditionCapability), `${kind} disables ${capability}`).toBe(false);
  }
}

describe('identityPolicy', () => {
  it('classifies anonymous, desktop, webui, enterprise member, and enterprise admin identities', () => {
    const cases: Array<[IdentityKind, string | null]> = [
      ['anonymous', null],
      ['desktop_operator', 'desktop-local-admin'],
      ['webui_local', 'webui_local-user'],
      ['enterprise_member', 'enterprise_member-user'],
      ['enterprise_admin', 'enterprise_admin-user'],
    ];

    for (const [kind, expectedUserId] of cases) {
      const snapshot = resolveIdentitySnapshot({
        user:
          expectedUserId === null
            ? null
            : {
                id: expectedUserId,
                username: kind,
                role: kind === 'enterprise_admin' ? 'org_admin' : 'member',
                tenant_id: kind === 'enterprise_member' || kind === 'enterprise_admin' ? 'tenant-1' : 'default',
              },
        enterpriseContext:
          kind === 'enterprise_member' || kind === 'enterprise_admin'
            ? {
                joined: true,
                tenantId: 'tenant-1',
                tenantName: 'Acme',
                role: kind === 'enterprise_admin' ? 'org_admin' : 'member',
              }
            : { joined: false, tenantId: 'default', tenantName: null },
        managementMode: kind === 'enterprise_member' || kind === 'enterprise_admin' ? 'enterprise' : 'standalone',
      });

      expect(snapshot.kind).toBe(kind);
      expect(snapshot.userId).toBe(expectedUserId);
    }
  });

  it('keeps personal capabilities available without enterprise login', () => {
    expectCapabilities('anonymous', {
      'personal.workspace': true,
      'enterprise.workspace': false,
      'teams.collaboration': false,
      'admin.console': false,
      'resources.org': false,
      'personal.agents': true,
      'workspace.agents': false,
      'issues.personal': true,
      'issues.teamPlanning': false,
      'skills.local': true,
      'skills.org': false,
      'rag.personal': true,
      'rag.org': false,
      'mcp.personal': true,
      'mcp.org': false,
    });
  });

  it('does not treat the desktop operator as an enterprise member or admin', () => {
    expectCapabilities('desktop_operator', {
      'personal.workspace': true,
      'enterprise.workspace': false,
      'teams.collaboration': false,
      'admin.console': false,
      'resources.org': false,
      'personal.agents': true,
      'workspace.agents': false,
      'issues.personal': true,
      'issues.teamPlanning': false,
      'skills.local': true,
      'skills.org': false,
      'rag.personal': true,
      'rag.org': false,
      'mcp.personal': true,
      'mcp.org': false,
    });
  });

  it('enables enterprise collaboration only for enterprise members in enterprise edition', () => {
    expectCapabilities('enterprise_member', {
      'personal.workspace': true,
      'enterprise.workspace': true,
      'teams.collaboration': true,
      'admin.console': false,
      'resources.org': true,
      'personal.agents': true,
      'workspace.agents': true,
      'issues.personal': true,
      'issues.teamPlanning': true,
      'skills.local': true,
      'skills.org': true,
      'rag.personal': true,
      'rag.org': true,
      'mcp.personal': true,
      'mcp.org': true,
    });
  });

  it('separates enterprise admin console access from team collaboration', () => {
    const snapshot = resolveIdentitySnapshot({
      user: {
        id: 'admin-user',
        username: 'admin',
        role: 'org_admin',
        tenant_id: 'tenant-1',
      },
      enterpriseContext: {
        joined: true,
        tenantId: 'tenant-1',
        tenantName: 'Acme',
        role: 'org_admin',
      },
      managementMode: 'standalone',
    });
    const gate = createEditionGate({ identity: snapshot });

    expect(snapshot.kind).toBe('enterprise_admin');
    expect(gate.can('admin.console')).toBe(true);
    expect(gate.can('enterprise.workspace')).toBe(false);
    expect(gate.can('teams.collaboration')).toBe(false);
    expect(gate.can('issues.personal')).toBe(true);
  });
});
