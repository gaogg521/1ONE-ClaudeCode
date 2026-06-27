import { ipcBridge } from '@/common';
import { uuid } from '@/common/utils';
import AgentSetupCard from '@/renderer/components/agent/AgentSetupCard';
import ContextUsageIndicator from '@/renderer/components/agent/ContextUsageIndicator';
import FilePreview from '@/renderer/components/media/FilePreview';
import HorizontalFileList from '@/renderer/components/media/HorizontalFileList';
import SendBox from '@/renderer/components/chat/sendbox';
import CommandQueuePanel from '@/renderer/components/chat/CommandQueuePanel';
import { useAgentReadinessCheck } from '@/renderer/hooks/agent/useAgentReadinessCheck';
import { useAutoTitle } from '@/renderer/hooks/chat/useAutoTitle';
import { useLatestRef } from '@/renderer/hooks/ui/useLatestRef';
import { useOpenFileSelector } from '@/renderer/hooks/file/useOpenFileSelector';
import FileAttachButton from '@/renderer/components/media/FileAttachButton';
import { getSendBoxDraftHook, type FileOrFolderItem } from '@/renderer/hooks/chat/useSendBoxDraft';
import { createSetUploadFile, useSendBoxFiles } from '@/renderer/hooks/chat/useSendBoxFiles';
import { useSlashCommands } from '@/renderer/hooks/chat/useSlashCommands';
import { useAddOrUpdateMessage, useRemoveMessageByMsgId, cancelPendingMessageUpdates } from '@/renderer/pages/conversation/Messages/hooks';
import {
  shouldEnqueueConversationCommand,
  useConversationCommandQueue,
  type ConversationCommandQueueItem,
} from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';
import { assertBridgeSuccess } from '@/renderer/pages/conversation/platforms/assertBridgeSuccess';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { allSupportedExts } from '@/renderer/services/FileService';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { mergeFileSelectionItems } from '@/renderer/utils/file/fileSelection';
import { useEffectiveWorkspace } from '@/renderer/hooks/conversation/useEffectiveWorkspace';
import { buildDisplayMessage, collectSelectedFiles } from '@/renderer/utils/file/messageFiles';
import { patchSentMessageContent } from '@/renderer/utils/file/patchSentMessage';
import { getModelContextLimit } from '@/renderer/utils/model/modelContextLimits';
import { Message, Tag } from '@arco-design/web-react';
import { Shield } from '@icon-park/react';
import { iconColors } from '@/renderer/styles/colors';
import AgentModeSelector from '@/renderer/components/agent/AgentModeSelector';
import { useTeamPermission } from '@/renderer/pages/team/hooks/TeamPermissionContext';
import ThoughtDisplay from '@/renderer/components/chat/ThoughtDisplay';
import { useCommandQueueEnabled } from '@/renderer/hooks/system/useCommandQueueEnabled';
import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import { getChatRailSurfaceStyle } from '@/renderer/utils/ui/contentRail';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GeminiModelSelection } from './useGeminiModelSelection';
import { useGeminiMessage } from './useGeminiMessage';
import { useGeminiQuotaFallback } from './useGeminiQuotaFallback';
import { useGeminiInitialMessage } from './useGeminiInitialMessage';
import { useConversationRuntimeView } from '@/renderer/pages/conversation/runtime/useConversationRuntimeView';
import { runtimeSummaryForActiveSend } from '@/renderer/pages/conversation/utils/conversationRuntime';
import { warmupConversation } from '@/renderer/pages/conversation/utils/warmupConversation';

const useGeminiSendBoxDraft = getSendBoxDraftHook('gemini', {
  _type: 'gemini',
  atPath: [],
  content: '',
  uploadFile: [],
});

const EMPTY_AT_PATH: Array<string | FileOrFolderItem> = [];
const EMPTY_UPLOAD_FILES: string[] = [];

const useSendBoxDraft = (conversation_id: string) => {
  const { data, mutate } = useGeminiSendBoxDraft(conversation_id);

  const atPath = data?.atPath ?? EMPTY_AT_PATH;
  const uploadFile = data?.uploadFile ?? EMPTY_UPLOAD_FILES;
  const content = data?.content ?? '';

  const setAtPath = useCallback(
    (nextAtPath: Array<string | FileOrFolderItem>) => {
      mutate((prev) => ({ ...prev, atPath: nextAtPath }));
    },
    [data, mutate]
  );

  const setUploadFile = createSetUploadFile(mutate, data);

  const setContent = useCallback(
    (nextContent: string) => {
      mutate((prev) => ({ ...prev, content: nextContent }));
    },
    [data, mutate]
  );

  return {
    atPath,
    uploadFile,
    setAtPath,
    setUploadFile,
    content,
    setContent,
  };
};

const GeminiSendBox: React.FC<{
  conversation_id: string;
  modelSelection: GeminiModelSelection;
  teamId?: string;
  tenantId?: string;
  agentSlotId?: string;
}> = ({ conversation_id, modelSelection, teamId, tenantId, agentSlotId }) => {
  const { t } = useTranslation();
  const teamPermission = useTeamPermission();
  const conversationContext = useConversationContextSafe();
  const stretchLayout = Boolean(conversationContext?.stretchLayout);
  const effectiveWorkspace = useEffectiveWorkspace(conversation_id);
  const isCommandQueueEnabled = useCommandQueueEnabled();
  const showModeSelector = !teamPermission || teamPermission.isLeadAgent;
  const { checkAndUpdateTitle } = useAutoTitle();

  // Agent auto-detection state - only for new conversation + no auth scenario
  const [showSetupCard, setShowSetupCard] = useState(false);
  const [isNewConversation, setIsNewConversation] = useState(true);
  const autoSwitchTriggeredRef = useRef(false);

  const { currentModel, getDisplayModelName, providers, geminiModeLookup, getAvailableModels, handleSelectModel } =
    modelSelection;

  // Check if no auth (no Google login AND no API key configured)
  const hasNoAuth = providers.length === 0;

  // Agent readiness check - only used when no auth
  const {
    isChecking: agentIsChecking,
    error: agentError,
    availableAgents,
    bestAgent,
    progress: checkProgress,
    currentAgent,
    performFullCheck,
    reset: resetAgentCheck,
  } = useAgentReadinessCheck({
    conversationType: 'gemini',
    autoCheck: false,
  });

  const { handleGeminiError } = useGeminiQuotaFallback({
    currentModel,
    providers,
    geminiModeLookup,
    getAvailableModels,
    handleSelectModel,
  });

  const {
    thought,
    running,
    hasHydratedRunningState,
    tokenUsage,
    setActiveMsgId,
    setWaitingResponse,
    resetState,
    hasThinkingMessage,
  } = useGeminiMessage(conversation_id, handleGeminiError);
  const runtimeView = useConversationRuntimeView(conversation_id);

  useEffect(() => {
    if (!conversation_id) return;
    void warmupConversation(conversation_id).catch(() => {
      // Warmup is best-effort; send path still works without it.
    });
  }, [conversation_id]);

  const { atPath, uploadFile, setAtPath, setUploadFile, content, setContent } = useSendBoxDraft(conversation_id);

  useGeminiInitialMessage({
    conversationId: conversation_id,
    currentModelId: currentModel?.useModel,
    hasNoAuth,
    setContent,
    setActiveMsgId,
    setWaitingResponse,
    autoSwitchTriggeredRef,
    setShowSetupCard,
    performFullCheck,
  });

  // Reset conversation state (detection only triggers on new message, not on mount/tab-switch)
  useEffect(() => {
    setShowSetupCard(false);
    setIsNewConversation(true);
    autoSwitchTriggeredRef.current = false;
    resetAgentCheck();

    void ipcBridge.database.getConversationMessages
      .invoke({ conversation_id, page: 0, pageSize: 1 })
      .then((messages) => {
        const hasMessages = messages && messages.length > 0;
        setIsNewConversation(!hasMessages);
      });
  }, [conversation_id, resetAgentCheck]);

  // Dismiss the setup card
  const handleDismissSetupCard = useCallback(() => {
    setShowSetupCard(false);
  }, []);

  // Retry agent check
  const handleRetryCheck = useCallback(() => {
    void performFullCheck();
  }, [performFullCheck]);

  const slashCommands = useSlashCommands(conversation_id);

  const addOrUpdateMessage = useAddOrUpdateMessage();
  const removeMessageByMsgId = useRemoveMessageByMsgId();
  const { setSendBoxHandler } = usePreviewContext();
  const isBusy =
    running ||
    (!teamId &&
      runtimeView.hydrated &&
      (!runtimeView.canSendMessage || runtimeView.isProcessing || runtimeView.view.localSubmitting));

  // Use useLatestRef to keep latest setters to avoid re-registering handler
  const setContentRef = useLatestRef(setContent);
  const latestContentRef = useLatestRef(content);
  const atPathRef = useLatestRef(atPath);

  // Register handler for adding text from preview panel to sendbox
  useEffect(() => {
    const handler = (text: string) => {
      const base = latestContentRef.current;
      const newContent = base ? `${base}\n${text}` : text;
      setContentRef.current(newContent);
    };
    setSendBoxHandler(handler);
  }, [setSendBoxHandler]);

  // Listen for sendbox.fill event to populate input from external sources
  useAddEventListener(
    'sendbox.fill',
    (text: string) => {
      setContentRef.current(text);
    },
    []
  );

  // Shared file handling logic
  const { handleFilesAdded, clearFiles } = useSendBoxFiles({
    atPath,
    uploadFile,
    setAtPath,
    setUploadFile,
  });

  const executeCommand = useCallback(
    async ({ input, files }: Pick<ConversationCommandQueueItem, 'input' | 'files'>) => {
      if (!teamId && !currentModel?.useModel) {
        Message.warning(t('conversation.chat.noModelSelected'));
        throw new Error('No model selected');
      }

      if (teamId) {
        const hasAttachments = files.length > 0;
        let optimisticMsgId: string | undefined;
        try {
          void checkAndUpdateTitle(conversation_id, input);
          if (hasAttachments) {
            optimisticMsgId = uuid();
            setActiveMsgId(optimisticMsgId);
            setWaitingResponse(true);
            const displayMessage = buildDisplayMessage(input, files, effectiveWorkspace);
            addOrUpdateMessage(
              {
                id: optimisticMsgId,
                type: 'text',
                position: 'right',
                conversation_id,
                content: { content: displayMessage },
                createdAt: Date.now(),
              },
              true
            );
          }
          if (agentSlotId) {
            const result = await ipcBridge.team.sendMessageToAgent.invoke({
              teamId,
              tenantId,
              slotId: agentSlotId,
              content: input,
              files,
            });
            const maybeError = result as unknown as { __bridgeError?: boolean; message?: string };
            if (maybeError.__bridgeError) {
              throw new Error(maybeError.message || 'Failed to send message to agent');
            }
          } else {
            const result = await ipcBridge.team.sendMessage.invoke({
              teamId,
              tenantId,
              content: input,
              files,
            });
            const maybeError = result as unknown as { __bridgeError?: boolean; message?: string };
            if (maybeError.__bridgeError) {
              throw new Error(maybeError.message || 'Failed to send message to team');
            }
          }
          emitter.emit('chat.history.refresh');
          if (files.length > 0) {
            emitter.emit('gemini.workspace.refresh');
          }
        } catch (error) {
          if (files.length > 0) {
            setWaitingResponse(false);
            setActiveMsgId(null);
            if (optimisticMsgId) {
              removeMessageByMsgId(optimisticMsgId);
            }
          }
          throw error;
        }
        return;
      }

      const msg_id = uuid();
      setActiveMsgId(msg_id);
      setWaitingResponse(true);
      runtimeView.markSendStarted();

      const displayMessage = buildDisplayMessage(input, files, effectiveWorkspace);
      addOrUpdateMessage(
        {
          id: msg_id,
          type: 'text',
          position: 'right',
          conversation_id,
          content: {
            content: displayMessage,
          },
          createdAt: Date.now(),
        },
        true
      );

      try {
        void checkAndUpdateTitle(conversation_id, input);
        const result = await ipcBridge.geminiConversation.sendMessage.invoke({
          input: displayMessage,
          msg_id,
          conversation_id,
          files,
        });
        assertBridgeSuccess(result, 'Failed to send message to Gemini');
        runtimeView.markSendAccepted(msg_id, runtimeSummaryForActiveSend(msg_id), msg_id);
        patchSentMessageContent(addOrUpdateMessage, conversation_id, msg_id, result);
        emitter.emit('chat.history.refresh');
        if (files.length > 0) {
          emitter.emit('gemini.workspace.refresh');
        }
      } catch (error) {
        runtimeView.markSendFailed(error instanceof Error ? error.message : String(error));
        setWaitingResponse(false);
        setActiveMsgId(null);
        // Drop the user bubble before the next rAF flush can paint it. Without
        // this, the pending addOrUpdateMessage batch may still win the race and
        // leave a stray user message on screen after a send failure.
        cancelPendingMessageUpdates();
        removeMessageByMsgId(msg_id);
        throw error;
      }
    },
    [
      addOrUpdateMessage,
      agentSlotId,
      checkAndUpdateTitle,
      conversation_id,
      currentModel?.useModel,
      setActiveMsgId,
      removeMessageByMsgId,
      runtimeView,
      setWaitingResponse,
      effectiveWorkspace,
      teamId,
      tenantId,
    ]
  );

  const {
    items: queuedCommands,
    isPaused: isQueuePaused,
    isInteractionLocked: isQueueInteractionLocked,
    hasPendingCommands,
    enqueue,
    update,
    remove,
    clear,
    reorder,
    pause,
    resume,
    lockInteraction,
    unlockInteraction,
    resetActiveExecution,
  } = useConversationCommandQueue({
    conversationId: conversation_id,
    enabled: isCommandQueueEnabled,
    isBusy,
    isHydrated: hasHydratedRunningState,
    onExecute: executeCommand,
  });

  const onSendHandler = async (message: string) => {
    if (!isCommandQueueEnabled && isBusy) {
      Message.warning(t('messages.conversationInProgress'));
      return;
    }

    const filesToSend = collectSelectedFiles(uploadFile, atPath);
    clearFiles();
    emitter.emit('gemini.selected.file.clear');

    if (
      shouldEnqueueConversationCommand({
        enabled: isCommandQueueEnabled,
        isBusy,
        hasPendingCommands,
      })
    ) {
      enqueue({ input: message, files: filesToSend });
      return;
    }

    await executeCommand({ input: message, files: filesToSend });
  };

  const appendSelectedFiles = useCallback(
    (files: string[]) => {
      setUploadFile((prev) => [...prev, ...files]);
    },
    [setUploadFile]
  );
  const { openFileSelector, onSlashBuiltinCommand } = useOpenFileSelector({
    onFilesSelected: appendSelectedFiles,
  });

  useAddEventListener('gemini.selected.file', setAtPath);
  useAddEventListener('gemini.selected.file.append', (selectedItems: Array<string | FileOrFolderItem>) => {
    const merged = mergeFileSelectionItems(atPathRef.current, selectedItems);
    if (merged !== atPathRef.current) {
      setAtPath(merged as Array<string | FileOrFolderItem>);
    }
  });

  // Stop conversation handler
  const handleStop = async (): Promise<void> => {
    const turnId = runtimeView.activeTurnId;
    if (turnId) {
      runtimeView.markStopRequested(turnId);
    }
    try {
      await ipcBridge.conversation.stop.invoke({ conversation_id });
    } finally {
      resetState();
      resetActiveExecution('stop');
      if (turnId) {
        runtimeView.markStopAcknowledged(turnId, {
          state: 'idle',
          can_send_message: true,
          has_task: false,
          is_processing: false,
          pending_confirmations: 0,
          turn_id: turnId,
        });
      } else {
        runtimeView.resetLocalGate('stop_without_turn');
      }
    }
  };

  return (
    <div
      className={`w-full flex flex-col mt-auto mb-16px ${stretchLayout ? '' : 'mx-auto'}`}
      style={getChatRailSurfaceStyle('surface', stretchLayout)}
    >
      {/* Agent Setup Card - only show for new conversation + no auth, auto-switch to available agent */}
      {showSetupCard && isNewConversation && hasNoAuth && (
        <AgentSetupCard
          conversationId={conversation_id}
          currentAgent={currentAgent}
          error={agentError}
          isChecking={agentIsChecking}
          progress={checkProgress}
          availableAgents={availableAgents}
          bestAgent={bestAgent}
          onDismiss={handleDismissSetupCard}
          onRetry={handleRetryCheck}
          autoSwitch={true}
          initialMessage={content}
        />
      )}

      <ThoughtDisplay
        thought={hasThinkingMessage ? undefined : thought}
        running={running && !hasThinkingMessage}
        onStop={handleStop}
      />
      <CommandQueuePanel
        items={queuedCommands}
        paused={isQueuePaused}
        interactionLocked={isQueueInteractionLocked}
        onPause={pause}
        onResume={resume}
        onInteractionLock={lockInteraction}
        onInteractionUnlock={unlockInteraction}
        onUpdate={(commandId, input) => update(commandId, { input })}
        onReorder={reorder}
        onRemove={remove}
        onClear={clear}
      />

      <SendBox
        value={content}
        onChange={setContent}
        loading={isBusy}
        disabled={!currentModel?.useModel}
        placeholder={
          currentModel?.useModel
            ? t('conversation.chat.sendMessageTo', { model: getDisplayModelName(currentModel.useModel) })
            : t('conversation.chat.noModelSelected')
        }
        onStop={handleStop}
        className='z-10'
        onFilesAdded={handleFilesAdded}
        hasPendingAttachments={uploadFile.length > 0 || atPath.length > 0}
        supportedExts={allSupportedExts}
        defaultMultiLine={true}
        lockMultiLine={true}
        tools={
          <div className='flex items-center gap-4px'>
            <FileAttachButton openFileSelector={openFileSelector} onLocalFilesAdded={handleFilesAdded} />
            {showModeSelector && (
              <AgentModeSelector
                backend='gemini'
                conversationId={conversation_id}
                compact
                compactLeadingIcon={<Shield theme='outline' size='14' fill={iconColors.secondary} />}
                modeLabelFormatter={(mode) => t(`agentMode.${mode.value}`, { defaultValue: mode.label })}
                compactLabelPrefix={t('agentMode.permission')}
                hideCompactLabelPrefixOnMobile
                onModeChanged={teamPermission?.propagateMode}
              />
            )}
          </div>
        }
        sendButtonPrefix={
          <ContextUsageIndicator
            tokenUsage={tokenUsage}
            contextLimit={getModelContextLimit(currentModel?.useModel)}
            size={24}
          />
        }
        prefix={
          <>
            {/* Files on top */}
            {(uploadFile.length > 0 || atPath.some((item) => (typeof item === 'string' ? true : item.isFile))) && (
              <HorizontalFileList>
                {uploadFile.map((path) => (
                  <FilePreview
                    key={path}
                    path={path}
                    onRemove={() => setUploadFile(uploadFile.filter((v) => v !== path))}
                  />
                ))}
                {atPath.map((item) => {
                  const isFile = typeof item === 'string' ? true : item.isFile;
                  const path = typeof item === 'string' ? item : item.path;
                  if (isFile) {
                    return (
                      <FilePreview
                        key={path}
                        path={path}
                        onRemove={() => {
                          const newAtPath = atPath.filter((v) =>
                            typeof v === 'string' ? v !== path : v.path !== path
                          );
                          emitter.emit('gemini.selected.file', newAtPath);
                          setAtPath(newAtPath);
                        }}
                      />
                    );
                  }
                  return null;
                })}
              </HorizontalFileList>
            )}
            {/* Folder tags below */}
            {atPath.some((item) => (typeof item === 'string' ? false : !item.isFile)) && (
              <div className='flex flex-wrap items-center gap-8px mb-8px'>
                {atPath.map((item) => {
                  if (typeof item === 'string') return null;
                  if (!item.isFile) {
                    return (
                      <Tag
                        key={item.path}
                        color='blue'
                        closable
                        onClose={() => {
                          const newAtPath = atPath.filter((v) => (typeof v === 'string' ? true : v.path !== item.path));
                          emitter.emit('gemini.selected.file', newAtPath);
                          setAtPath(newAtPath);
                        }}
                      >
                        {item.name}
                      </Tag>
                    );
                  }
                  return null;
                })}
              </div>
            )}
          </>
        }
        onSend={onSendHandler}
        slashCommands={slashCommands}
        onSlashBuiltinCommand={onSlashBuiltinCommand}
        allowSendWhileLoading={isCommandQueueEnabled}
      ></SendBox>
    </div>
  );
};

export default GeminiSendBox;
