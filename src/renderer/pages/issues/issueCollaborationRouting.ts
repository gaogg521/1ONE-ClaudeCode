export type IssuePlanningPathInput = {
  issueId: string;
  issueSubject?: string;
  teamsCollaborationEnabled: boolean;
};

export function buildIssueAssistantPath(issueId: string): string {
  return `/super-assistant?issueId=${encodeURIComponent(issueId)}`;
}

export function buildIssuePlanningPath(input: IssuePlanningPathInput): string {
  const issueId = encodeURIComponent(input.issueId);
  if (!input.teamsCollaborationEnabled) {
    return `/issues/${issueId}`;
  }
  const params = new URLSearchParams({ issueId: input.issueId });
  if (input.issueSubject) {
    params.set('issueSubject', input.issueSubject);
  }
  return `/enterprise/cteam?${params.toString()}`;
}
