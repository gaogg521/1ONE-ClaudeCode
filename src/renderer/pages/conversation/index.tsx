import { ipcBridge } from '@/common';
import { Spin, Result, Button } from '@arco-design/web-react';
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import ChatConversation from './components/ChatConversation';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { useConversationTabs } from './hooks/ConversationTabsContext';
import { useAutoTitle } from '@/renderer/hooks/chat/useAutoTitle';

const ChatConversationIndex: React.FC = () => {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { closePreview } = usePreviewContext();
  const { openTab } = useConversationTabs();
  const { syncTitleFromHistory } = useAutoTitle();
  const previousConversationIdRef = useRef<string | undefined>(undefined);
  const defaultConversationTitle = t('conversation.welcome.newConversation');

  useEffect(() => {
    if (!id) return;

    // 切换会话时自动关闭预览面板，避免跨会话残留
    // Close preview on every conversation change, including initial mount
    // (component may remount via React Router, resetting the ref to undefined)
    if (previousConversationIdRef.current !== id) {
      closePreview();
    }

    previousConversationIdRef.current = id;
  }, [id, closePreview]);

  const { data, isLoading, error, mutate } = useSWR(`conversation/${id}`, () => {
    return ipcBridge.conversation.get.invoke({ id });
  });

  useEffect(() => {
    if (!id) return;

    return ipcBridge.conversation.listChanged.on((event) => {
      if (event.conversationId !== id || event.action !== 'updated') {
        return;
      }

      void mutate();
    });
  }, [id, mutate]);

  useEffect(() => {
    if (!data || data.name !== defaultConversationTitle) {
      return;
    }

    void syncTitleFromHistory(data.id);
  }, [data, defaultConversationTitle, syncTitleFromHistory]);

  // 当会话数据加载完成后，自动打开 tab
  // Automatically open tab when conversation data is loaded
  useEffect(() => {
    if (data) {
      openTab(data);
    }
  }, [data, openTab]);

  if (isLoading) return <Spin loading></Spin>;
  if (!data || error) return (
    <div className='flex items-center justify-center h-full'>
      <Result
        status='404'
        title={t('conversation.notFound.title', { defaultValue: '会话不存在' })}
        subTitle={t('conversation.notFound.desc', { defaultValue: '此会话可能已被删除，请返回重新选择。' })}
        extra={<Button type='primary' onClick={() => navigate('/sessions')}>{t('common.back', { defaultValue: '返回' })}</Button>}
      />
    </div>
  );
  return <ChatConversation conversation={data}></ChatConversation>;
};

export default ChatConversationIndex;
