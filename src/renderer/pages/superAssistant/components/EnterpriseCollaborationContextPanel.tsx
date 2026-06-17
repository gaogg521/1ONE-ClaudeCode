import React from 'react';
import { Button, Tag } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import type { EnterpriseCollaborationContext } from '../hooks/useEnterpriseCollaborationContext';

type EnterpriseCollaborationContextPanelProps = {
  issueSubject?: string | null;
  loading?: boolean;
  context: Pick<
    EnterpriseCollaborationContext,
    'ragDocumentCount' | 'ragReady' | 'skillCount' | 'skillNames' | 'enabledMcpCount' | 'mcpNames'
  >;
  onOpenEnterpriseKnowledge: () => void;
  onOpenSkills: () => void;
  onOpenMcp: () => void;
  compact?: boolean;
};

const EnterpriseCollaborationContextPanel: React.FC<EnterpriseCollaborationContextPanelProps> = ({
  issueSubject,
  loading = false,
  context,
  onOpenEnterpriseKnowledge,
  onOpenSkills,
  onOpenMcp,
  compact = false,
}) => {
  const { t } = useTranslation();

  if (loading) {
    return <div className='text-12px text-t-tertiary'>{t('common.loading', { defaultValue: '请稍候...' })}</div>;
  }

  return (
    <div className={compact ? 'flex flex-col gap-8px' : 'flex flex-col gap-12px'}>
      {issueSubject ? (
        <div className='text-12px text-t-secondary'>
          {t('common.superAssistant.collaborationContext.issueBinding', {
            defaultValue: '当前 Issue「{{subject}}」可调用以下企业能力：',
            subject: issueSubject,
          })}
        </div>
      ) : (
        <div className='text-12px text-t-secondary'>
          {t('common.superAssistant.collaborationContext.globalHint', {
            defaultValue: '协作流可调用以下企业知识与工具：',
          })}
        </div>
      )}

      <div className='flex flex-wrap items-center gap-6px'>
        <Tag size='small' color={context.ragReady ? 'green' : 'gray'}>
          {context.ragReady
            ? t('common.superAssistant.collaborationContext.ragReady', {
                defaultValue: '知识库 {{count}} 篇',
                count: context.ragDocumentCount,
              })
            : t('common.superAssistant.collaborationContext.ragEmpty', {
                defaultValue: '知识库未就绪',
              })}
        </Tag>
        {context.skillNames.length > 0 ? (
          context.skillNames.map((name) => (
            <Tag key={name} size='small' color='arcoblue'>
              {name}
            </Tag>
          ))
        ) : (
          <Tag size='small' color='gray'>
            {t('common.superAssistant.collaborationContext.noSkills', { defaultValue: '暂无 Skills' })}
          </Tag>
        )}
        {context.mcpNames.length > 0 ? (
          context.mcpNames.map((name) => (
            <Tag key={name} size='small' color='purple'>
              {name}
            </Tag>
          ))
        ) : (
          <Tag size='small' color='gray'>
            {t('common.superAssistant.collaborationContext.noMcp', { defaultValue: '暂无 MCP' })}
          </Tag>
        )}
        {context.skillCount > context.skillNames.length ? (
          <span className='text-11px text-t-tertiary'>
            {t('common.superAssistant.collaborationContext.moreSkills', {
              defaultValue: '+{{count}} Skills',
              count: context.skillCount - context.skillNames.length,
            })}
          </span>
        ) : null}
        {context.enabledMcpCount > context.mcpNames.length ? (
          <span className='text-11px text-t-tertiary'>
            {t('common.superAssistant.collaborationContext.moreMcp', {
              defaultValue: '+{{count}} MCP',
              count: context.enabledMcpCount - context.mcpNames.length,
            })}
          </span>
        ) : null}
      </div>

      <div className='flex flex-wrap gap-6px'>
        <Button size='small' type='primary' onClick={onOpenEnterpriseKnowledge}>
          {t('common.superAssistant.collaborationContext.openRag', { defaultValue: '企业知识库 / RAG' })}
        </Button>
        <Button size='small' onClick={onOpenSkills}>
          {t('common.superAssistant.openSkills', { defaultValue: 'Skills' })}
        </Button>
        <Button size='small' onClick={onOpenMcp}>
          {t('common.superAssistant.openMcp', { defaultValue: 'MCP' })}
        </Button>
      </div>
    </div>
  );
};

export default EnterpriseCollaborationContextPanel;
