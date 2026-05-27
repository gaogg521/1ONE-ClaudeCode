/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { getCsrfToken } from '@process/webserver/middleware/csrfClient';
import { fetchWebuiApi } from '@/renderer/utils/webuiApiBase';
import { enterpriseGet, enterpriseMutate } from './client';

export type ArtifactRepo = {
  id: string;
  name: string;
  repo_type: string;
  endpoint: string;
};

export type ArtifactRecord = {
  id: string;
  name: string;
  version: string;
  file_size: number;
  checksum: string;
  repo_name: string;
  download_count: number;
  scope: string;
};

export type CodeRepo = {
  id: string;
  name: string;
  url: string;
  provider: string;
  default_branch: string;
  credential_id: string;
};

export type DoraMetricRecord = {
  metric_name: string;
  value: number;
};

export type McpRegistryRecord = {
  id: string;
  name: string;
  type: 'stdio' | 'sse';
  endpoint: string;
  enabled?: boolean;
  hasKeys?: boolean;
};

export type RagDocumentRecord = {
  id: string;
  title: string;
  file_path?: string;
  file_size?: number;
  mime_type?: string;
  status?: string;
  last_error?: string;
  created_at?: number;
  chunk_count?: number;
  scope?: string;
};

export type RagSearchResultRecord = {
  title: string;
  chunk_index: number;
  content: string;
  score: number;
};

export type TestPlan = {
  id: string;
  name: string;
  description: string;
  linked_requirement_id: string;
  status: string;
};

export type TestCaseRecord = {
  id: string;
  plan_id: string;
  subject: string;
  steps: string;
  expected: string;
  status: string;
  assigned_to: string;
};

export type FlowStageRecord = {
  id: string;
  requirement_id: string;
  stage_name: string;
  entry_time: number;
  exit_time: number | null;
  wait_duration_ms: number;
  process_duration_ms: number;
  req_subject: string;
};

export type PipelineListItem = {
  id: string;
  name: string;
  enabled?: number;
  definition_json?: string;
};

export type PipelineRunRecord = {
  status: string;
  log_content: string;
  stages_status_json: string;
};

export type TeamRecord = {
  id: string;
  name: string;
  workspace: string;
  workspace_mode: string;
  user_id: string;
  tenant_id: string;
  created_at: number;
  updated_at: number;
};

export type TeamMemberRecord = {
  user_id: string;
  username: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  created_at: number;
  updated_at: number;
};

export type TeamTaskRecord = {
  id: string;
  team_id: string;
  subject: string;
  description: string | null;
  status: string;
  owner: string | null;
  blocked_by?: string;
  blocks?: string;
  metadata?: Record<string, unknown> | string | null;
  created_at: number;
  updated_at: number;
};

export type AdminUserRecord = {
  id: string;
  username: string;
  role: string;
  tenant_id?: string | null;
};

export type SkillRecord = {
  id: string;
  name: string;
  description: string;
  content: string;
  enabled: number;
  scope: string;
  team_id: string | null;
  created_by: string;
  created_at: number;
  updated_at: number;
};

export type AuditLogRecord = {
  id: string;
  username: string;
  action: string;
  resource: string;
  ip_address: string;
  created_at: number;
};

export type MilestoneRecord = {
  id: string;
  name: string;
  description: string;
  due_date: string;
  epic_count: number;
  completed_count: number;
  created_at: number;
};

export type RequirementType = 'epic' | 'feature' | 'story' | 'bug' | 'task';
export type RequirementStatus = 'backlog' | 'planning' | 'developing' | 'testing' | 'completed';
export type RequirementPriority = 'low' | 'medium' | 'high' | 'urgent';

export type RequirementRecord = {
  id: string;
  tenant_id: string;
  parent_id: string | null;
  type: RequirementType;
  subject: string;
  description: string | null;
  status: RequirementStatus;
  priority: RequirementPriority;
  assigned_to: string | null;
  creator_id: string;
  created_at: number;
  updated_at: number;
  children?: RequirementRecord[];
};

export async function listArtifactRepos(): Promise<ArtifactRepo[]> {
  return enterpriseGet<ArtifactRepo[]>('/api/admin/artifact-repos');
}

export async function listArtifacts(): Promise<ArtifactRecord[]> {
  return enterpriseGet<ArtifactRecord[]>('/api/admin/artifacts');
}

export async function createArtifactRepo(payload: Record<string, unknown>): Promise<void> {
  await enterpriseMutate('/api/admin/artifact-repos', 'POST', payload);
}

export async function deleteArtifactRepo(id: string): Promise<void> {
  await enterpriseMutate(`/api/admin/artifact-repos/${id}`, 'DELETE', {});
}

export async function listCodeRepos(): Promise<CodeRepo[]> {
  return enterpriseGet<CodeRepo[]>('/api/admin/code-repos');
}

export async function createCodeRepo(payload: Record<string, unknown>): Promise<void> {
  await enterpriseMutate('/api/admin/code-repos', 'POST', payload);
}

export async function deleteCodeRepo(id: string): Promise<void> {
  await enterpriseMutate(`/api/admin/code-repos/${id}`, 'DELETE', {});
}

export async function listDoraMetrics(): Promise<DoraMetricRecord[]> {
  return enterpriseGet<DoraMetricRecord[]>('/api/admin/metrics?type=dora');
}

export async function listMcpRegistry(): Promise<McpRegistryRecord[]> {
  return enterpriseGet<McpRegistryRecord[]>('/api/admin/mcp/registry');
}

export async function saveMcpRegistry(payload: Record<string, unknown>): Promise<void> {
  await enterpriseMutate('/api/admin/mcp/registry', 'POST', payload);
}

export async function deleteMcpRegistry(id: string): Promise<void> {
  await enterpriseMutate(`/api/admin/mcp/registry/${id}`, 'DELETE', {});
}

export async function importMcpRegistryBatch(
  items: Record<string, unknown>[]
): Promise<{ count: number }> {
  return enterpriseMutate<{ count: number }>('/api/admin/mcp/batch', 'POST', { items });
}

export async function listRagDocuments(): Promise<RagDocumentRecord[]> {
  return enterpriseGet<RagDocumentRecord[]>('/api/admin/rag/documents');
}

export async function createRagDocument(payload: Record<string, unknown>): Promise<void> {
  await enterpriseMutate('/api/admin/rag/documents', 'POST', payload);
}

export async function deleteRagDocument(id: string): Promise<void> {
  await enterpriseMutate(`/api/admin/rag/documents/${id}`, 'DELETE', {});
}

export async function queryRagDocuments(
  payload: Record<string, unknown>
): Promise<RagSearchResultRecord[]> {
  return enterpriseMutate<RagSearchResultRecord[]>('/api/admin/rag/query', 'POST', payload);
}

export async function importRagUrl(
  payload: Record<string, unknown>
): Promise<{ id: string }> {
  return enterpriseMutate<{ id: string }>('/api/admin/rag/import-url', 'POST', payload);
}

export async function importRagFeishuDocument(
  payload: Record<string, unknown>
): Promise<{ id: string }> {
  return enterpriseMutate<{ id: string }>('/api/admin/rag/import-feishu', 'POST', payload);
}

export async function uploadRagDocument(
  file: File
): Promise<{ id: string; status: string }> {
  const token = getCsrfToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['x-csrf-token'] = token;
  }
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetchWebuiApi('/api/admin/rag/upload', {
    method: 'POST',
    headers,
    body: formData,
  });
  const body = (await response.json()) as {
    success?: boolean;
    data?: { id: string; status: string };
    message?: string;
  };
  if (!response.ok || !body?.success || !body.data) {
    throw new Error(body?.message || '上传失败');
  }
  return body.data;
}

export async function listTeams(): Promise<TeamRecord[]> {
  return enterpriseGet<TeamRecord[]>('/api/admin/teams');
}

export async function listAdminUsers(): Promise<AdminUserRecord[]> {
  return enterpriseGet<AdminUserRecord[]>('/api/admin/users');
}

export async function listSkills(): Promise<SkillRecord[]> {
  return enterpriseGet<SkillRecord[]>('/api/admin/skills');
}

export async function listAuditLogs(): Promise<AuditLogRecord[]> {
  return enterpriseGet<AuditLogRecord[]>('/api/admin/audit-logs');
}

export async function saveSkill(payload: Record<string, unknown>): Promise<void> {
  await enterpriseMutate('/api/admin/skills', 'POST', payload);
}

export async function deleteSkill(id: string): Promise<void> {
  await enterpriseMutate(`/api/admin/skills/${encodeURIComponent(id)}`, 'DELETE', {});
}

export async function importSkillsBatch(
  items: Record<string, unknown>[]
): Promise<{ count: number }> {
  return enterpriseMutate<{ count: number }>('/api/admin/skills/batch', 'POST', { items });
}

export async function listMilestones(): Promise<MilestoneRecord[]> {
  return enterpriseGet<MilestoneRecord[]>('/api/admin/milestones');
}

export async function createMilestone(payload: Record<string, unknown>): Promise<void> {
  await enterpriseMutate('/api/admin/milestones', 'POST', payload);
}

export async function listRequirementsTree(): Promise<RequirementRecord[]> {
  return enterpriseGet<RequirementRecord[]>('/api/admin/requirements/tree');
}

export async function createRequirement(
  payload: Record<string, unknown>
): Promise<{ id: string }> {
  return enterpriseMutate<{ id: string }>('/api/admin/requirements', 'POST', payload);
}

export async function updateRequirement(
  requirementId: string,
  payload: Record<string, unknown>
): Promise<void> {
  await enterpriseMutate(
    `/api/admin/requirements/${encodeURIComponent(requirementId)}`,
    'PATCH',
    payload
  );
}

export async function deleteRequirement(requirementId: string): Promise<void> {
  await enterpriseMutate(
    `/api/admin/requirements/${encodeURIComponent(requirementId)}`,
    'DELETE',
    {}
  );
}

export async function createTeam(payload: Record<string, unknown>): Promise<void> {
  await enterpriseMutate('/api/admin/teams', 'POST', payload);
}

export async function listTeamMembers(teamId: string): Promise<TeamMemberRecord[]> {
  return enterpriseGet<TeamMemberRecord[]>(`/api/admin/teams/${encodeURIComponent(teamId)}/members`);
}

export async function addTeamMember(
  teamId: string,
  payload: Record<string, unknown>
): Promise<void> {
  await enterpriseMutate(`/api/admin/teams/${encodeURIComponent(teamId)}/members`, 'POST', payload);
}

export async function updateTeamMemberRole(
  teamId: string,
  userId: string,
  payload: Record<string, unknown>
): Promise<void> {
  await enterpriseMutate(
    `/api/admin/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`,
    'PATCH',
    payload
  );
}

export async function removeTeamMember(teamId: string, userId: string): Promise<void> {
  await enterpriseMutate(
    `/api/admin/teams/${encodeURIComponent(teamId)}/members/${encodeURIComponent(userId)}`,
    'DELETE',
    {}
  );
}

export async function listTeamTasks(teamId: string): Promise<TeamTaskRecord[]> {
  return enterpriseGet<TeamTaskRecord[]>(`/api/team-tasks?teamId=${encodeURIComponent(teamId)}`);
}

export async function createTeamTask(payload: Record<string, unknown>): Promise<void> {
  await enterpriseMutate('/api/team-tasks', 'POST', payload);
}

export async function updateTeamTask(
  taskId: string,
  payload: Record<string, unknown>
): Promise<void> {
  await enterpriseMutate(`/api/team-tasks/${encodeURIComponent(taskId)}`, 'PATCH', payload);
}

export async function deleteTeamTask(taskId: string): Promise<void> {
  await enterpriseMutate(`/api/team-tasks/${encodeURIComponent(taskId)}`, 'DELETE', {});
}

export async function listTestPlans(): Promise<TestPlan[]> {
  return enterpriseGet<TestPlan[]>('/api/admin/test-plans');
}

export async function createTestPlan(payload: Record<string, unknown>): Promise<void> {
  await enterpriseMutate('/api/admin/test-plans', 'POST', payload);
}

export async function listTestCases(planId: string): Promise<TestCaseRecord[]> {
  return enterpriseGet<TestCaseRecord[]>(`/api/admin/test-cases?planId=${encodeURIComponent(planId)}`);
}

export async function createTestCase(payload: Record<string, unknown>): Promise<void> {
  await enterpriseMutate('/api/admin/test-cases', 'POST', payload);
}

export async function listValueStreamStages(): Promise<FlowStageRecord[]> {
  return enterpriseGet<FlowStageRecord[]>('/api/admin/value-stream');
}

export async function listPipelines(): Promise<PipelineListItem[]> {
  return enterpriseGet<PipelineListItem[]>('/api/admin/pipelines');
}

export async function savePipeline(payload: Record<string, unknown>): Promise<PipelineListItem> {
  return enterpriseMutate<PipelineListItem>('/api/admin/pipelines', 'POST', payload);
}

export async function updatePipeline(
  pipelineId: string,
  payload: Record<string, unknown>
): Promise<PipelineListItem> {
  return enterpriseMutate<PipelineListItem>(`/api/admin/pipelines/${pipelineId}`, 'PATCH', payload);
}

export async function triggerPipelineRun(
  pipelineId: string
): Promise<{ runId: string }> {
  return enterpriseMutate<{ runId: string }>(`/api/admin/pipelines/run/${pipelineId}`, 'POST', {});
}

export async function getPipelineRun(runId: string): Promise<PipelineRunRecord> {
  return enterpriseGet<PipelineRunRecord>(`/api/admin/pipelines/runs/${runId}`);
}
