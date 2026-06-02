import type {
  RequirementPriority,
  RequirementRecord,
  RequirementStatus,
  RequirementType,
} from '@/renderer/utils/enterpriseApi/modules';

type IssueLabelTranslator = (key: string, options?: { defaultValue?: string }) => string;

const STATUS_ZH: Record<RequirementStatus, string> = {
  backlog: '待规划',
  planning: '规划中',
  developing: '开发中',
  testing: '评审中',
  completed: '已完成',
};

const PRIORITY_ZH: Record<RequirementPriority, string> = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急',
};

const TYPE_ZH: Record<RequirementType, string> = {
  epic: '史诗',
  feature: '特性',
  story: '用户故事',
  bug: '缺陷',
  task: '任务',
};

export const ISSUE_CREATE_TYPES: RequirementType[] = ['story', 'task', 'bug', 'feature'];
export const ISSUE_PRIORITIES: RequirementPriority[] = ['low', 'medium', 'high', 'urgent'];

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

export function formatTypeLabel(type: RequirementType, t?: IssueLabelTranslator): string {
  const fallback = TYPE_ZH[type] ?? type;
  return t ? t(`common.issues.type.${type}`, { defaultValue: fallback }) : fallback;
}

export function formatPriorityLabel(priority: RequirementPriority, t?: IssueLabelTranslator): string {
  const fallback = PRIORITY_ZH[priority] ?? priority;
  return t ? t(`common.issues.priority.${priority}`, { defaultValue: fallback }) : fallback;
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

export function formatStatusLabel(status: RequirementStatus, t?: IssueLabelTranslator): string {
  const fallback = STATUS_ZH[status] ?? status;
  return t ? t(`common.issues.status.${status}`, { defaultValue: fallback }) : fallback;
}
