import { describe, expect, it } from 'vitest';
import {
  buildEnterpriseLoginPath,
  buildEnterpriseRouteLoginPath,
  buildWebuiAdminLoginPath,
  resolveLoginIntentFromSearch,
} from '@/renderer/utils/enterpriseLoginNavigation';

describe('enterprise login navigation', () => {
  it('builds enterprise member login path explicitly', () => {
    expect(buildEnterpriseLoginPath('/issues?tab=tasks')).toBe(
      '/login?redirect=%2Fissues%3Ftab%3Dtasks&mode=enterprise'
    );
  });

  it('builds WebUI admin login path explicitly', () => {
    expect(buildWebuiAdminLoginPath('/sessions')).toBe('/login?redirect=%2Fsessions&mode=admin');
  });

  it('does not redirect back to login pages', () => {
    // 90305cfe: default landing changed from session list (/sessions) to chat input (/guid)
    expect(buildEnterpriseLoginPath('/login?mode=enterprise')).toBe('/login?redirect=%2Fguid&mode=enterprise');
    expect(buildWebuiAdminLoginPath('/login')).toBe('/login?redirect=%2Fguid&mode=admin');
  });

  it('parses explicit login intents while keeping legacy mode compatibility', () => {
    expect(resolveLoginIntentFromSearch('?intent=enterprise-member')).toBe('enterprise-member');
    expect(resolveLoginIntentFromSearch('?intent=webui-admin')).toBe('webui-admin');
    expect(resolveLoginIntentFromSearch('?mode=enterprise')).toBe('enterprise-member');
    expect(resolveLoginIntentFromSearch('?mode=admin')).toBe('webui-admin');
    expect(resolveLoginIntentFromSearch('')).toBe('standalone-webui');
  });

  it('uses admin login intent for enterprise admin routes', () => {
    expect(buildEnterpriseRouteLoginPath('/enterprise/auth')).toBe(
      '/login?redirect=%2Fenterprise%2Fauth&mode=admin&intent=webui-admin'
    );
    expect(buildEnterpriseRouteLoginPath('/enterprise/cteam')).toBe(
      '/login?redirect=%2Fenterprise%2Fcteam&mode=enterprise&intent=enterprise-member'
    );
  });

  it('builds admin console home login with admin mode', () => {
    expect(buildWebuiAdminLoginPath('/enterprise')).toBe('/login?redirect=%2Fenterprise&mode=admin');
  });
});
