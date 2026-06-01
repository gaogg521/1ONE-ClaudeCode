import React, { Suspense } from 'react';
import { HashRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import AppLoader from '@renderer/components/layout/AppLoader';
import PersonalBrowserAuthLayout from '@/renderer/components/layout/PersonalBrowserAuthLayout';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import { resolvePostLoginRedirectPath } from '@/common/auth/enterpriseRoles';
import { isElectronDesktop } from '@/renderer/utils/platform';
import {
  consumePostLoginRedirect,
  readRedirectFromSearch,
  setPostLoginRedirect,
} from '@/renderer/utils/postLoginRedirect';
const Conversation = React.lazy(() => import('@renderer/pages/conversation'));
const Guid = React.lazy(() => import('@renderer/pages/guid'));
const SessionsPage = React.lazy(() => import('@renderer/pages/sessions'));
const TasksPage = React.lazy(() => import('@renderer/pages/tasks'));
const AdminUsers = React.lazy(() => import('@renderer/pages/admin/AdminUsers'));
const AdminAuth = React.lazy(() => import('@renderer/pages/admin/AdminAuth'));
const AdminInvites = React.lazy(() => import('@renderer/pages/admin/AdminInvites'));
const AdminTeams = React.lazy(() => import('@renderer/pages/admin/AdminTeams'));
const AdminKanban = React.lazy(() => import('@renderer/pages/admin/AdminKanban'));
const AdminRag = React.lazy(() => import('@renderer/pages/admin/AdminRag'));
const AdminMcp = React.lazy(() => import('@renderer/pages/admin/AdminMcp'));
const AdminSkills = React.lazy(() => import('@renderer/pages/admin/AdminSkills'));
const AdminPipelineEditor = React.lazy(() => import('@renderer/pages/admin/AdminPipelineEditor'));
const MilestoneView = React.lazy(() => import('@renderer/pages/admin/MilestoneView'));
const CPackArtifactRepo = React.lazy(() => import('@renderer/pages/admin/CPackArtifactRepo'));
const CCodeRepoList = React.lazy(() => import('@renderer/pages/admin/CCodeRepoList'));
const CMeasDashboard = React.lazy(() => import('@renderer/pages/admin/CMeasDashboard'));
const CTestManagement = React.lazy(() => import('@renderer/pages/admin/CTestManagement'));
const CFlowBoard = React.lazy(() => import('@renderer/pages/admin/CFlowBoard'));
const EnterpriseJoinLayout = React.lazy(() => import('@renderer/pages/enterprise/EnterpriseJoinLayout'));
const EnterpriseLayout = React.lazy(() => import('@renderer/pages/enterprise/EnterpriseLayout'));
const EnterpriseHome = React.lazy(() => import('@renderer/pages/enterprise/EnterpriseHome'));
const EnterpriseSettings = React.lazy(() => import('@renderer/pages/enterprise/EnterpriseSettings'));
const EnterpriseUsagePage = React.lazy(() => import('@renderer/pages/enterprise/EnterpriseUsagePage'));
const EnterpriseSecurityPage = React.lazy(() => import('@renderer/pages/enterprise/EnterpriseSecurityPage'));
const PersonalShell = React.lazy(() => import('@renderer/components/layout/PersonalShell'));
const LegacyEnterpriseRedirect = React.lazy(() => import('@renderer/components/layout/LegacyEnterpriseRedirect'));
const HooksPage = React.lazy(() => import('@renderer/pages/hooks'));
const MCPPage = React.lazy(() => import('@renderer/pages/mcp'));
const MemoryPage = React.lazy(() => import('@renderer/pages/memory'));
const AgentSettings = React.lazy(() => import('@renderer/pages/settings/AgentSettings'));
const AssistantSettings = React.lazy(() => import('@renderer/pages/settings/AssistantSettings'));
const SkillsHubSettings = React.lazy(() => import('@renderer/pages/settings/SkillsHubSettings'));
const AionrsSettings = React.lazy(() => import('@renderer/pages/settings/AionrsSettings'));
// Model settings is a high-traffic route and pulls in heavy UI modules.
// Eager-load it to avoid long Suspense spinner / perceived "freeze" when navigating from Settings.
import ModeSettings from '@renderer/pages/settings/ModeSettings';
const SystemSettings = React.lazy(() => import('@renderer/pages/settings/SystemSettings'));
const ToolsSettings = React.lazy(() => import('@renderer/pages/settings/ToolsSettings'));
const WebuiSettings = React.lazy(() => import('@renderer/pages/settings/WebuiSettings'));
const ExtensionSettingsPage = React.lazy(() => import('@renderer/pages/settings/ExtensionSettingsPage'));
const LoginPage = React.lazy(() => import('@renderer/pages/login'));
const ComponentsShowcase = React.lazy(() => import('@renderer/pages/TestShowcase'));
const ScheduledTasksPage = React.lazy(() => import('@renderer/pages/cron/ScheduledTasksPage'));
const TaskDetailPage = React.lazy(() => import('@renderer/pages/cron/ScheduledTasksPage/TaskDetailPage'));
const TeamIndex = React.lazy(() => import('@renderer/pages/team'));
const SuperAssistantPage = React.lazy(() => import('@renderer/pages/superAssistant'));
const IssuesPage = React.lazy(() => import('@renderer/pages/issues'));
const IssueDetailPage = React.lazy(() => import('@renderer/pages/issues/IssueDetailPage'));
const SkillsPage = React.lazy(() => import('@renderer/pages/skills'));
const SkillDetailPage = React.lazy(() => import('@renderer/pages/skills/SkillDetailPage'));
const WorkspacePage = React.lazy(() => import('@renderer/pages/workspace'));
const WorkspaceSettingsShell = React.lazy(() => import('@renderer/pages/workspace/WorkspaceSettings'));
const WorkspaceProjectSettings = React.lazy(() => import('@renderer/pages/workspace/WorkspaceProjectSettings'));

/** Legacy redirect map: old paths → new enterprise paths. */
const LEGACY_REDIRECTS = [
  { from: '/users', to: '/enterprise/users' },
  { from: '/admin', to: '/enterprise/users' },
  { from: '/admin/users', to: '/enterprise/users' },
  { from: '/admin/teams', to: '/enterprise/teams' },
  { from: '/admin/auth', to: '/enterprise/auth' },
  { from: '/settings/auth', to: '/enterprise/auth' },
] as const;

const withRouteFallback = (Component: React.LazyExoticComponent<React.ComponentType>) => (
  <Suspense fallback={<AppLoader />}>
    <Component />
  </Suspense>
);

const EnterpriseAuthLayout: React.FC = () => {
  const { status, user, ready } = useAuth();
  const location = useLocation();
  const isDesktop = isElectronDesktop();

  if (!ready || (status === 'checking' && !user)) {
    return <AppLoader />;
  }

  if (isDesktop && location.pathname === '/enterprise') {
    return <Outlet />;
  }

  if (status !== 'authenticated' && !user) {
    const returnPath = `${location.pathname}${location.search}`;
    if (returnPath && returnPath !== '/login') {
      setPostLoginRedirect(returnPath);
    }
    const query = new URLSearchParams({
      redirect: returnPath || '/enterprise',
      mode: 'enterprise',
    });
    return <Navigate to={`/login?${query.toString()}`} replace />;
  }

  return <Outlet />;
};

const LoginRoute: React.FC = () => {
  const { status, user } = useAuth();
  const location = useLocation();
  const { loading: enterpriseLoading } = useWebuiEnterpriseMode();

  if (status === 'authenticated' && user) {
    if (enterpriseLoading) {
      return <AppLoader />;
    }
    const fromQuery = readRedirectFromSearch(location.search);
    let target = fromQuery ?? consumePostLoginRedirect();
    target = resolvePostLoginRedirectPath(
      target,
      user?.role,
      user?.tenant_id,
      isElectronDesktop()
    );
    return <Navigate to={target} replace />;
  }

  return withRouteFallback(LoginPage);
};

const PanelRoute: React.FC = () => {
  return (
    <HashRouter>
      <Routes>
        <Route path='/login' element={<LoginRoute />} />
        <Route element={<PersonalBrowserAuthLayout />}>
          <Route element={withRouteFallback(PersonalShell)}>
          <Route index element={<Navigate to='/guid' replace />} />
          <Route path='/sessions' element={withRouteFallback(SessionsPage)} />
          <Route path='/workspace' element={withRouteFallback(WorkspacePage)} />
          <Route path='/workspace/settings' element={<Navigate to='/workspace/settings/projects' replace />} />
          <Route
            path='/workspace/settings/projects'
            element={
              <Suspense fallback={<AppLoader />}>
                <WorkspaceSettingsShell>
                  <WorkspaceProjectSettings />
                </WorkspaceSettingsShell>
              </Suspense>
            }
          />
          <Route
            path='/workspace/settings/model'
            element={
              <Suspense fallback={<AppLoader />}>
                <WorkspaceSettingsShell>
                  <ModeSettings />
                </WorkspaceSettingsShell>
              </Suspense>
            }
          />
          <Route
            path='/workspace/settings/assistants'
            element={
              <Suspense fallback={<AppLoader />}>
                <WorkspaceSettingsShell>
                  <AssistantSettings />
                </WorkspaceSettingsShell>
              </Suspense>
            }
          />
          <Route
            path='/workspace/settings/tools'
            element={
              <Suspense fallback={<AppLoader />}>
                <WorkspaceSettingsShell>
                  <ToolsSettings />
                </WorkspaceSettingsShell>
              </Suspense>
            }
          />
          <Route
            path='/workspace/settings/agent'
            element={
              <Suspense fallback={<AppLoader />}>
                <WorkspaceSettingsShell>
                  <AgentSettings />
                </WorkspaceSettingsShell>
              </Suspense>
            }
          />
          <Route path='/issues' element={withRouteFallback(IssuesPage)} />
          <Route path='/issues/:issueId' element={withRouteFallback(IssueDetailPage)} />
          <Route path='/tasks' element={withRouteFallback(TasksPage)} />
          <Route path='/super-assistant' element={withRouteFallback(SuperAssistantPage)} />
          <Route path='/skills' element={withRouteFallback(SkillsPage)} />
          <Route path='/skills/:skillKey' element={withRouteFallback(SkillDetailPage)} />
          <Route path='/hooks' element={withRouteFallback(HooksPage)} />
          <Route path='/mcp' element={withRouteFallback(MCPPage)} />
          <Route path='/memory' element={withRouteFallback(MemoryPage)} />
          <Route path='/guid' element={withRouteFallback(Guid)} />
          <Route path='/conversation/:id' element={withRouteFallback(Conversation)} />
          <Route path='/settings/aionrs' element={withRouteFallback(AionrsSettings)} />
          <Route path='/team/:id' element={withRouteFallback(TeamIndex)} />
          <Route path='/settings/gemini' element={<Navigate to='/settings/system?section=gemini' replace />} />
          <Route path='/settings/model' element={<ModeSettings />} />
          <Route path='/settings/assistants' element={withRouteFallback(AssistantSettings)} />
          <Route path='/settings/agent' element={withRouteFallback(AgentSettings)} />
          <Route path='/settings/skills-hub' element={withRouteFallback(SkillsHubSettings)} />
          <Route path='/settings/webui' element={withRouteFallback(WebuiSettings)} />
          <Route path='/settings/system' element={withRouteFallback(SystemSettings)} />
          <Route path='/settings/display' element={<Navigate to='/settings/tools' replace />} />
          <Route path='/settings/about' element={<Navigate to='/settings/system?section=about' replace />} />
          <Route path='/settings/tools' element={withRouteFallback(ToolsSettings)} />
          <Route path='/settings/ext/:tabId' element={withRouteFallback(ExtensionSettingsPage)} />
          <Route path='/settings' element={<Navigate to='/settings/agent' replace />} />
          <Route path='/test/components' element={withRouteFallback(ComponentsShowcase)} />
          <Route path='/scheduled' element={withRouteFallback(ScheduledTasksPage)} />
          <Route path='/scheduled/:jobId' element={withRouteFallback(TaskDetailPage)} />
          <Route path='/enterprise/join' element={withRouteFallback(EnterpriseJoinLayout)} />
          </Route>
        </Route>

        <Route element={<EnterpriseAuthLayout />}>
          <Route path='/enterprise' element={withRouteFallback(EnterpriseLayout)}>
            <Route index element={withRouteFallback(EnterpriseHome)} />
            <Route path='settings' element={withRouteFallback(EnterpriseSettings)} />
            <Route path='users' element={withRouteFallback(AdminUsers)} />
            <Route path='teams' element={withRouteFallback(AdminTeams)} />
            <Route path='auth' element={withRouteFallback(AdminAuth)} />
            <Route path='invites' element={withRouteFallback(AdminInvites)} />
            <Route path='cteam' element={withRouteFallback(AdminKanban)} />
            <Route path='kanban' element={withRouteFallback(AdminKanban)} />
            <Route path='rag' element={withRouteFallback(AdminRag)} />
            <Route path='mcp' element={withRouteFallback(AdminMcp)} />
            <Route path='skills' element={withRouteFallback(AdminSkills)} />
            <Route path='pipeline-editor' element={withRouteFallback(AdminPipelineEditor)} />
            <Route path='milestones' element={withRouteFallback(MilestoneView)} />
            <Route path='cpack' element={withRouteFallback(CPackArtifactRepo)} />
            <Route path='ccode' element={withRouteFallback(CCodeRepoList)} />
            <Route path='cmeas' element={withRouteFallback(CMeasDashboard)} />
            <Route path='ctest' element={withRouteFallback(CTestManagement)} />
            <Route path='cflow' element={withRouteFallback(CFlowBoard)} />
            <Route path='cagent' element={<Navigate to='/super-assistant?tab=workspace' replace />} />
            <Route path='usage' element={withRouteFallback(EnterpriseUsagePage)} />
            <Route path='security' element={withRouteFallback(EnterpriseSecurityPage)} />
          </Route>

          <Route path='/settings/enterprise/*' element={withRouteFallback(LegacyEnterpriseRedirect)} />
          {LEGACY_REDIRECTS.map(({ from, to }) => (
            <Route key={from} path={from} element={<Navigate to={to} replace />} />
          ))}
        </Route>
        <Route path='*' element={<Navigate to='/guid' replace />} />
      </Routes>
    </HashRouter>
  );
};

export default PanelRoute;
