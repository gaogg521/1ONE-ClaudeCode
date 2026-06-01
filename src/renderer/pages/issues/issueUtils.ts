import type {
  RequirementPriority,
  RequirementRecord,
  RequirementStatus,
} from '@/renderer/utils/enterpriseApi/modules';

export type IssueListItem = RequirementRecord & {
  epicId: string | null;
  epicSubject: string | null;
};

export const ISSUE_STATUS_ORDER: RequirementStatus[] = [
  'backlog',
  'planning',
  'developing',
  'testing',
  'completed',
];

export function flattenIssues(tree: RequirementRecord[]): IssueListItem[] {
  const items: IssueListItem[] = [];

  const walk = (
    nodes: RequirementRecord[],
    context: { epicId: string | null; epicSubject: string | null }
  ) => {
    nodes.forEach((node) => {
      const nextContext =
        node.type === 'epic'
          ? { epicId: node.id, epicSubject: node.subject }
          : context;

      if (node.type !== 'epic') {
        items.push({
          ...node,
          epicId: context.epicId,
          epicSubject: context.epicSubject,
        });
      }

      if (node.children?.length) {
        walk(node.children, nextContext);
      }
    });
  };

  walk(tree, { epicId: null, epicSubject: null });
  return items;
}

export function findRequirementById(
  tree: RequirementRecord[],
  requirementId: string
): RequirementRecord | null {
  for (const node of tree) {
    if (node.id === requirementId) {
      return node;
    }
    if (node.children?.length) {
      const child = findRequirementById(node.children, requirementId);
      if (child) {
        return child;
      }
    }
  }
  return null;
}

export function countNestedChildren(node: RequirementRecord | null): number {
  if (!node?.children?.length) {
    return 0;
  }
  return node.children.reduce((sum, child) => sum + 1 + countNestedChildren(child), 0);
}

export function formatPriorityLabel(priority: RequirementPriority): string {
  switch (priority) {
    case 'urgent':
      return '紧急';
    case 'high':
      return '高';
    case 'medium':
      return '中';
    case 'low':
    default:
      return '低';
  }
}

export function priorityTagColor(priority: RequirementPriority): string {
  switch (priority) {
    case 'urgent':
      return 'red';
    case 'high':
      return 'orangered';
    case 'medium':
      return 'orange';
    case 'low':
    default:
      return 'gray';
  }
}

export function formatStatusLabel(status: RequirementStatus): string {
  switch (status) {
    case 'planning':
      return '规划中';
    case 'developing':
      return '开发中';
    case 'testing':
      return '评审中';
    case 'completed':
      return '已完成';
    case 'backlog':
    default:
      return '待规划';
  }
}
