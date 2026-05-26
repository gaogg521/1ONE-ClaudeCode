/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ISqliteDriver } from './drivers/ISqliteDriver';

/**
 * Initialize database schema with all tables and indexes
 */
export function initSchema(db: ISqliteDriver): void {
  // Enable foreign keys
  db.pragma('foreign_keys = ON');
  // Wait up to 5 seconds when the database is locked by another connection
  // instead of failing immediately (prevents "database is locked" errors
  // when multiple processes or startup tasks access the database concurrently)
  db.pragma('busy_timeout = 5000');
  // Enable Write-Ahead Logging for better performance
  try {
    db.pragma('journal_mode = WAL');
  } catch (error) {
    console.warn('[Database] Failed to enable WAL mode, using default journal mode:', error);
    // Continue with default journal mode if WAL fails
  }

  // Users table (账户系统)
  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    avatar_path TEXT,
    jwt_secret TEXT,
    role TEXT NOT NULL DEFAULT 'member',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_login INTEGER
  )`);
  // tenant_id indexes: applied after migrations via applyTenantAwareIndexes() — legacy DBs may not have tenant_id yet
  db.exec('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');

  // Auth providers (WebUI 多登录方案配置)
  db.exec(`CREATE TABLE IF NOT EXISTS auth_providers (
    provider TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL DEFAULT 0,
    config_json TEXT NOT NULL DEFAULT '{}',
    updated_at INTEGER NOT NULL
  )`);

  // Auth identities (外部账号 <-> 本地用户绑定表)
  db.exec(`CREATE TABLE IF NOT EXISTS auth_identities (
    provider TEXT NOT NULL,
    external_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (provider, external_id),
    UNIQUE (provider, user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_auth_identities_user ON auth_identities(user_id)');

  // Conversations table (会话表 - 存储TChatConversation)
  db.exec(`CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    user_id TEXT NOT NULL,
    team_id TEXT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    extra TEXT NOT NULL,
    model TEXT,
    status TEXT CHECK(status IN ('pending', 'running', 'finished')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  // tenant_id / team_id indexes — same as users; columns may be added in migrations v27/v28
  db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(type)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at DESC)');

  // Messages table (消息表 - 存储TMessage)
  db.exec(`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    msg_id TEXT,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    position TEXT CHECK(position IN ('left', 'right', 'center', 'pop')),
    status TEXT CHECK(status IN ('finish', 'pending', 'error', 'work')),
    created_at INTEGER NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(type)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_messages_msg_id ON messages(msg_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at)');

  // Teams table (团队模式)
  db.exec(`CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    workspace TEXT NOT NULL,
    workspace_mode TEXT NOT NULL DEFAULT 'shared',
    lead_agent_id TEXT NOT NULL DEFAULT '',
    agents TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_teams_user_id ON teams(user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_teams_updated_at ON teams(updated_at)');

  // Tenants table（企业/租户）
  db.exec(`CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);

  // Enterprise invite codes（企业邀请码）
  db.exec(`CREATE TABLE IF NOT EXISTS tenant_invites (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    created_by TEXT NOT NULL,
    max_uses INTEGER,
    use_count INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER,
    created_at INTEGER NOT NULL,
    revoked INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_tenant_invites_tenant ON tenant_invites(tenant_id, created_at DESC)');

  // Team memberships（团队成员关系与角色）
  db.exec(`CREATE TABLE IF NOT EXISTS team_memberships (
    tenant_id TEXT NOT NULL,
    team_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (team_id, user_id),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);
  // team_memberships tenant indexes: created in migration_v27 when table is ensured + after applyTenantAwareIndexes

  // Mailbox table (团队消息邮箱)
  db.exec(`CREATE TABLE IF NOT EXISTS mailbox (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    team_id TEXT NOT NULL,
    to_agent_id TEXT NOT NULL,
    from_agent_id TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'message',
    content TEXT NOT NULL,
    summary TEXT,
    read INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_mailbox_to ON mailbox(team_id, to_agent_id, read)');

  // Team tasks table (团队任务)
  db.exec(`CREATE TABLE IF NOT EXISTS team_tasks (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    team_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    owner TEXT,
    blocked_by TEXT NOT NULL DEFAULT '[]',
    blocks TEXT NOT NULL DEFAULT '[]',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_team ON team_tasks(team_id, status)');

  // Personal tasks table (个人任务)
  db.exec(`CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    user_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    active_form TEXT,
    session_name TEXT,
    assigned_to TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id, status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_to)');

  // 1. CTeam 敏捷协同：需求树与任务关联表 / Agile requirements and task linking table
  db.exec(`CREATE TABLE IF NOT EXISTS requirements (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    parent_id TEXT NULL,
    type TEXT NOT NULL, -- 'epic', 'feature', 'story', 'bug', 'task'
    subject TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'backlog', -- 'proposed', 'backlog', 'developing', 'testing', 'completed'
    priority TEXT NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'urgent'
    assigned_to TEXT,
    creator_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY(parent_id) REFERENCES requirements(id) ON DELETE CASCADE
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_requirements_parent ON requirements(parent_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_requirements_status ON requirements(status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_requirements_assigned ON requirements(assigned_to)');

  // 2. RAG 知识库：文档元数据表 / RAG Documents Metadata table
  db.exec(`CREATE TABLE IF NOT EXISTS rag_documents (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    title TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'indexing', 'completed', 'failed'
    chunk_count INTEGER DEFAULT 0,
    last_error TEXT,
    scope TEXT NOT NULL DEFAULT 'personal', -- 'personal', 'team', 'organization'
    team_id TEXT,
    created_by TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);

  // 3. RAG 知识库：切片与向量表 / RAG Document Chunks and Embeddings table
  db.exec(`CREATE TABLE IF NOT EXISTS rag_document_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    token_count INTEGER NOT NULL,
    embedding BLOB NOT NULL, -- 存储 float32 数组向量数据 (1536维或384维)
    FOREIGN KEY(document_id) REFERENCES rag_documents(id) ON DELETE CASCADE
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_rag_chunks_document ON rag_document_chunks(document_id)');

  // 4. MCP 统一工具箱：工具与安全凭证表 / Enterprise MCP Proxy Registry table
  db.exec(`CREATE TABLE IF NOT EXISTS mcp_registry (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'sse', 'stdio'
    endpoint TEXT NOT NULL,
    env_json TEXT, -- 加密存储敏感凭证
    enabled INTEGER NOT NULL DEFAULT 1,
    scope TEXT NOT NULL DEFAULT 'personal', -- 'personal', 'team', 'organization'
    team_id TEXT,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(tenant_id, name)
  )`);

  // 5. 企业 Skills 技能仓库 / Enterprise Skills Registry
  db.exec(`CREATE TABLE IF NOT EXISTS skills_registry (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    name TEXT NOT NULL,
    description TEXT,
    content TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    scope TEXT NOT NULL DEFAULT 'personal', -- 'personal', 'team', 'organization'
    team_id TEXT,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(tenant_id, name)
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_skills_tenant ON skills_registry(tenant_id)');

  // 7. CTeam 版本里程碑 / Milestones table
  db.exec(`CREATE TABLE IF NOT EXISTS milestones (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    name TEXT NOT NULL,
    description TEXT,
    due_date TEXT,
    epic_count INTEGER DEFAULT 0,
    completed_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_milestones_tenant ON milestones(tenant_id)');

  // 8. CPack 制品仓库 / Artifact Repos
  db.exec(`CREATE TABLE IF NOT EXISTS artifact_repos (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    name TEXT NOT NULL,
    repo_type TEXT NOT NULL DEFAULT 'generic', -- generic, docker, maven, ai-model
    endpoint TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS artifacts (
    id TEXT PRIMARY KEY,
    repo_id TEXT NOT NULL,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0,
    checksum TEXT,
    scope TEXT NOT NULL DEFAULT 'personal',
    created_by TEXT NOT NULL,
    download_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(repo_id) REFERENCES artifact_repos(id) ON DELETE CASCADE
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_artifacts_repo ON artifacts(repo_id)');

  // 10. CTest 测试管理 / Test Plans & Cases
  db.exec(`CREATE TABLE IF NOT EXISTS test_plans (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL DEFAULT 'default', name TEXT NOT NULL, description TEXT,
    linked_requirement_id TEXT, status TEXT DEFAULT 'active', created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS test_cases (
    id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, subject TEXT NOT NULL, steps TEXT, expected TEXT,
    status TEXT DEFAULT 'pending', assigned_to TEXT, created_at INTEGER NOT NULL,
    FOREIGN KEY(plan_id) REFERENCES test_plans(id) ON DELETE CASCADE
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_test_cases_plan ON test_cases(plan_id)');

  // 11. CMeas 效能度量 / Metrics Snapshots
  db.exec(`CREATE TABLE IF NOT EXISTS metrics_snapshots (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL DEFAULT 'default', metric_type TEXT NOT NULL,
    metric_name TEXT NOT NULL, value REAL NOT NULL, period TEXT, recorded_at INTEGER NOT NULL
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_metrics_tenant_type ON metrics_snapshots(tenant_id, metric_type)');

  // 12. CFlow 价值流 / Value Stream Stages
  db.exec(`CREATE TABLE IF NOT EXISTS value_stream_stages (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL DEFAULT 'default', requirement_id TEXT,
    stage_name TEXT NOT NULL, entry_time INTEGER, exit_time INTEGER,
    wait_duration_ms INTEGER DEFAULT 0, process_duration_ms INTEGER DEFAULT 0,
    FOREIGN KEY(requirement_id) REFERENCES requirements(id) ON DELETE CASCADE
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_flow_requirement ON value_stream_stages(requirement_id)');

  // 14. 安全审计日志 / Audit Logs
  db.exec(`CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL DEFAULT 'default', user_id TEXT, username TEXT,
    action TEXT NOT NULL, resource TEXT, ip_address TEXT, user_agent TEXT, created_at INTEGER NOT NULL
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_logs(tenant_id, created_at DESC)');

  // 15. DevOps 持续集成流水线 / DevOps Pipelines
  db.exec(`CREATE TABLE IF NOT EXISTS devops_pipelines (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    name TEXT NOT NULL,
    associated_team_id TEXT,
    definition_json TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);

  // 6. DevOps 持续集成流水线执行记录 / DevOps Pipeline Runs
  db.exec(`CREATE TABLE IF NOT EXISTS devops_pipeline_runs (
    id TEXT PRIMARY KEY,
    pipeline_id TEXT NOT NULL,
    trigger_type TEXT NOT NULL,
    trigger_by TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    stages_status_json TEXT NOT NULL DEFAULT '[]',
    log_content TEXT,
    duration_ms INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    finished_at INTEGER,
    FOREIGN KEY(pipeline_id) REFERENCES devops_pipelines(id) ON DELETE CASCADE
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_devops_pipeline_runs_pipeline ON devops_pipeline_runs(pipeline_id)');

  console.log('[Database] Schema initialized successfully');
}

/**
 * Indexes on tenant_id / team_id columns must run **after** migrations: existing user DBs
 * may have old tables without these columns; initSchema only runs CREATE TABLE IF NOT EXISTS
 * and cannot reshape legacy rows until ALTER TABLE in migrations.
 */
export function applyTenantAwareIndexes(db: ISqliteDriver): void {
  db.exec('CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_conversations_tenant_id ON conversations(tenant_id)');
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_conversations_team_id ON conversations(tenant_id, team_id, updated_at DESC)'
  );
  db.exec('CREATE INDEX IF NOT EXISTS idx_teams_tenant_id ON teams(tenant_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_team_memberships_user ON team_memberships(tenant_id, user_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_team_memberships_team ON team_memberships(tenant_id, team_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_requirements_tenant_id ON requirements(tenant_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_rag_documents_tenant_id ON rag_documents(tenant_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_devops_pipelines_tenant_id ON devops_pipelines(tenant_id)');
}

/**
 * Get database version for migration tracking
 * Uses SQLite's built-in user_version pragma
 */
export function getDatabaseVersion(db: ISqliteDriver): number {
  try {
    const result = db.pragma('user_version', { simple: true }) as number;
    return result;
  } catch {
    return 0;
  }
}

/**
 * Set database version
 * Uses SQLite's built-in user_version pragma
 */
export function setDatabaseVersion(db: ISqliteDriver, version: number): void {
  db.pragma(`user_version = ${version}`);
}

/**
 * Current database schema version
 * Update this when adding new migrations in migrations.ts
 */
export const CURRENT_DB_VERSION = 40;
