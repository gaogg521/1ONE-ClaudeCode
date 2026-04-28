import React, { Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppLoader from '@renderer/components/layout/AppLoader';
import { useAuth } from '@renderer/hooks/context/AuthContext';
const Conversation = React.lazy(() => import('@renderer/pages/conversation'));
const Guid = React.lazy(() => import('@renderer/pages/guid'));
const SessionsPage = React.lazy(() => import('@renderer/pages/sessions'));
const TasksPage = React.lazy(() => import('@renderer/pages/tasks'));
const UsersPage = React.lazy(() => import('@renderer/pages/users'));
const AdminShell = React.lazy(() => import('@renderer/pages/admin/AdminShell'));
const AdminUsers = React.lazy(() => import('@renderer/pages/admin/AdminUsers'));
const AdminAuth = React.lazy(() => import('@renderer/pages/admin/AdminAuth'));
const AdminTeams = React.lazy(() => import('@renderer/pages/admin/AdminTeams'));
const HooksPage = React.lazy(() => import('@renderer/pages/hooks'));
const MCPPage = React.lazy(() => import('@renderer/pages/mcp'));
const MemoryPage = React.lazy(() => import('@renderer/pages/memory'));
const AgentSettings = React.lazy(() => import('@renderer/pages/settings/AgentSettings'));
const AssistantSettings = React.lazy(() => import('@renderer/pages/settings/AssistantSettings'));
const SkillsHubSettings = React.lazy(() => import('@renderer/pages/settings/SkillsHubSettings'));
const AionrsSettings = React.lazy(() => import('@renderer/pages/settings/AionrsSettings'));
const GeminiSettings = React.lazy(() => import('@renderer/pages/settings/GeminiSettings'));
// Model settings is a high-traffic route and pulls in heavy UI modules.
// Eager-load it to avoid long Suspense spinner / perceived "freeze" when navigating from Settings.
import ModeSettings from '@renderer/pages/settings/ModeSettings';
const SystemSettings = React.lazy(() => import('@renderer/pages/settings/SystemSettings'));
const ToolsSettings = React.lazy(() => import('@renderer/pages/settings/ToolsSettings'));
const WebuiSettings = React.lazy(() => import('@renderer/pages/settings/WebuiSettings'));
const AuthProvidersSettings = React.lazy(() => import('@renderer/pages/settings/AuthProvidersSettings'));
const ExtensionSettingsPage = React.lazy(() => import('@renderer/pages/settings/ExtensionSettingsPage'));
const LoginPage = React.lazy(() => import('@renderer/pages/login'));
const ComponentsShowcase = React.lazy(() => import('@renderer/pages/TestShowcase'));
const ScheduledTasksPage = React.lazy(() => import('@renderer/pages/cron/ScheduledTasksPage'));
const TaskDetailPage = React.lazy(() => import('@renderer/pages/cron/ScheduledTasksPage/TaskDetailPage'));
const TeamIndex = React.lazy(() => import('@renderer/pages/team'));
const WorkspacePage = React.lazy(() => import('@renderer/pages/workspace'));
const WorkspaceSettingsShell = React.lazy(() => import('@renderer/pages/workspace/WorkspaceSettings'));

const withRouteFallback = (Component: React.LazyExoticComponent<React.ComponentType>) => (
  <Suspense fallback={<AppLoader />}>
    <Component />
  </Suspense>
);

const ProtectedLayout: React.FC<{ layout: React.ReactElement }> = ({ layout }) => {
  const { status } = useAuth();

  if (status === 'checking') {
    return <AppLoader />;
  }

  if (status !== 'authenticated') {
    return <Navigate to='/login' replace />;
  }

  return React.cloneElement(layout);
};

const PanelRoute: React.FC<{ layout: React.ReactElement }> = ({ layout }) => {
  const { status } = useAuth();

  return (
    <HashRouter>
      <Routes>
        <Route
          path='/login'
          element={status === 'authenticated' ? <Navigate to='/sessions' replace /> : withRouteFallback(LoginPage)}
        />
        <Route element={<ProtectedLayout layout={layout} />}>
          <Route index element={<Navigate to='/sessions' replace />} />
          <Route path='/sessions' element={withRouteFallback(SessionsPage)} />
          <Route path='/workspace' element={withRouteFallback(WorkspacePage)} />
          <Route path='/workspace/settings' element={<Navigate to='/workspace/settings/model' replace />} />
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
          <Route path='/tasks' element={withRouteFallback(TasksPage)} />
          {/* Backward compatible route; admin console is /admin/users */}
          <Route path='/users' element={<Navigate to='/admin/users' replace />} />
          <Route path='/admin' element={withRouteFallback(AdminShell)}>
            <Route index element={<Navigate to='/admin/users' replace />} />
            <Route path='users' element={withRouteFallback(AdminUsers)} />
            <Route path='teams' element={withRouteFallback(AdminTeams)} />
            <Route path='auth' element={withRouteFallback(AdminAuth)} />
          </Route>
          <Route path='/hooks' element={withRouteFallback(HooksPage)} />
          <Route path='/mcp' element={withRouteFallback(MCPPage)} />
          <Route path='/memory' element={withRouteFallback(MemoryPage)} />
          <Route path='/guid' element={withRouteFallback(Guid)} />
          <Route path='/conversation/:id' element={withRouteFallback(Conversation)} />
          <Route path='/settings/aionrs' element={withRouteFallback(AionrsSettings)} />
          <Route path='/team/:id' element={withRouteFallback(TeamIndex)} />
          <Route path='/settings/gemini' element={withRouteFallback(GeminiSettings)} />
          <Route path='/settings/model' element={<ModeSettings />} />
          <Route path='/settings/assistants' element={withRouteFallback(AssistantSettings)} />
          <Route path='/settings/agent' element={withRouteFallback(AgentSettings)} />
          <Route path='/settings/skills-hub' element={withRouteFallback(SkillsHubSettings)} />
          <Route path='/settings/webui' element={withRouteFallback(WebuiSettings)} />
          {/* Auth providers config is admin-only; keep a redirect for old links */}
          <Route path='/settings/auth' element={<Navigate to='/admin/auth' replace />} />
          <Route path='/settings/system' element={withRouteFallback(SystemSettings)} />
          <Route path='/settings/about' element={withRouteFallback(SystemSettings)} />
          <Route path='/settings/tools' element={withRouteFallback(ToolsSettings)} />
          <Route path='/settings/ext/:tabId' element={withRouteFallback(ExtensionSettingsPage)} />
          <Route path='/settings' element={<Navigate to='/settings/agent' replace />} />
          <Route path='/test/components' element={withRouteFallback(ComponentsShowcase)} />
          <Route path='/scheduled' element={withRouteFallback(ScheduledTasksPage)} />
          <Route path='/scheduled/:jobId' element={withRouteFallback(TaskDetailPage)} />
        </Route>
        <Route path='*' element={<Navigate to={status === 'authenticated' ? '/sessions' : '/login'} replace />} />
      </Routes>
    </HashRouter>
  );
};

export default PanelRoute;
