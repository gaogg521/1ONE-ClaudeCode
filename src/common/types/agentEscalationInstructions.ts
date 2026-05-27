/**
 * Shared escalation instructions for Super Assistant agents (Multica db-boy pattern).
 */
export const AGENT_BLOCKER_ESCALATION_INSTRUCTIONS = `[Blocker Escalation — Multica pattern]
When you cannot proceed without someone else:
1. Call team_enterprise_members if you need a human assignee username
2. Call team_issue_escalate with:
   - subject: concise follow-up title
   - blocker_reason: why you are blocked
   - parent_issue_id: the current issue ID (if provided in your assignment)
   - assign_to_agent: another agent teammate when they should implement the fix
   - assign_to_member: @username when a human must act
3. Continue with any work that is NOT blocked — do not idle waiting`;
