import { describe, expect, it } from 'vitest';
import {
  canCreateWorkspaceAgent,
  resolveInitialAgentVisibility,
} from '@/renderer/pages/superAssistant/components/CreateWorkspaceAgentModal';

describe('super assistant agent creation rules', () => {
  it('defaults to personal agent creation', () => {
    expect(resolveInitialAgentVisibility()).toBe('personal');
  });

  it('allows personal agents without a team id', () => {
    expect(
      canCreateWorkspaceAgent({
        agentName: '个人研究助手',
        agentKey: 'claude',
        teamId: '',
        visibility: 'personal',
      })
    ).toBe(true);
  });

  it('requires a team id for workspace agents', () => {
    expect(
      canCreateWorkspaceAgent({
        agentName: '团队研究助手',
        agentKey: 'claude',
        teamId: '',
        visibility: 'workspace',
      })
    ).toBe(false);
  });

  it('allows workspace agents when a team is selected', () => {
    expect(
      canCreateWorkspaceAgent({
        agentName: '团队研究助手',
        agentKey: 'claude',
        teamId: 'team-1',
        visibility: 'workspace',
      })
    ).toBe(true);
  });
});
