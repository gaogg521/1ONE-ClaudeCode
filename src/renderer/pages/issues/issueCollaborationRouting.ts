export type IssuePlanningPathInput = {
  issueId: string;
  issueSubject?: string;
  teamsCollaborationEnabled: boolean;
};

export type IssueAssistantPathInput = {
  issueId: string;
  /** Personal edition: open assistant and start processing with a personal agent. */
  autoStart?: boolean;
};

export function buildIssueAssistantPath(input: string | IssueAssistantPathInput): string {
  const issueId = typeof input === 'string' ? input : input.issueId;
  const autoStart = typeof input === 'string' ? false : Boolean(input.autoStart);
  const params = new URLSearchParams({
    issueId,
    tab: 'overview',
  });
  if (autoStart) {
    params.set('action', 'start');
  }
  return `/super-assistant?${params.toString()}`;
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
