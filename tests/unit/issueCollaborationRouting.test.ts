import { describe, expect, it } from 'vitest';
import { buildIssueAssistantPath, buildIssuePlanningPath } from '@/renderer/pages/issues/issueCollaborationRouting';

describe('issue collaboration routing', () => {
  it('keeps personal issue planning inside issue detail', () => {
    expect(
      buildIssuePlanningPath({
        issueId: 'issue-1',
        issueSubject: '个人 Issue',
        teamsCollaborationEnabled: false,
      })
    ).toBe('/issues/issue-1');
  });

  it('routes enterprise issue planning to team planning board', () => {
    expect(
      buildIssuePlanningPath({
        issueId: 'issue-1',
        issueSubject: '团队 Issue',
        teamsCollaborationEnabled: true,
      })
    ).toBe('/enterprise/cteam?issueId=issue-1&issueSubject=%E5%9B%A2%E9%98%9F+Issue');
  });

  it('opens assistant without forcing enterprise routes', () => {
    expect(buildIssueAssistantPath('issue-1')).toBe('/super-assistant?issueId=issue-1');
  });
});
