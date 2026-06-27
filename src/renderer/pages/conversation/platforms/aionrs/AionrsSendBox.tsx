/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { uuid } from '@/common/utils';
import ContextUsageIndicator from '@/renderer/components/agent/ContextUsageIndicator';
import FilePreview from '@/renderer/components/media/FilePreview';
import HorizontalFileList from '@/renderer/components/media/HorizontalFileList';
import SendBox from '@/renderer/components/chat/sendbox';
import CommandQueuePanel from '@/renderer/components/chat/CommandQueuePanel';
import { useAutoTitle } from '@/renderer/hooks/chat/useAutoTitle';
import { useLatestRef } from '@/renderer/hooks/ui/useLatestRef';
import { useOpenFileSelector } from '@/renderer/hooks/file/useOpenFileSelector';
import FileAttachButton from '@/renderer/components/media/FileAttachButton';
import { getSendBoxDraftHook, type FileOrFolderItem } from '@/renderer/hooks/chat/useSendBoxDraft';
import { createSetUploadFile, useSendBoxFiles } from '@/renderer/hooks/chat/useSendBoxFiles';
import { useSlashCommands } from '@/renderer/hooks/chat/useSlashCommands';
import { useAddOrUpdateMessage, useRemoveMessageByMsgId } from '@/renderer/pages/conversation/Messages/hooks';
import {
  shouldEnqueueConversationCommand,
  useConversationCommandQueue,
  type ConversationCommandQueueItem,
} from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';
import { assertBridgeSuccess } from '@/renderer/pages/conversation/platforms/assertBridgeSuccess';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { allSupportedExts } from '@/renderer/services/FileService';
import { isImageFilePath } from '@/common/chat/messageFiles';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { mergeFileSelectionItems } from '@/renderer/utils/file/fileSelection';
import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import { useEffectiveWorkspace } from '@/renderer/hooks/conversation/useEffectiveWorkspace';
import { buildDisplayMessage, collectSelectedFiles } from '@/renderer/utils/file/messageFiles';
import { patchSentMessageContent } from '@/renderer/utils/file/patchSentMessage';
import { getModelContextLimit } from '@/renderer/utils/model/modelContextLimits';
import { useCommandQueueEnabled } from '@/renderer/hooks/system/useCommandQueueEnabled';
import { Message, Tag } from '@arco-design/web-react';
import { Shield } from '@icon-park/react';
import { iconColors } from '@/renderer/styles/colors';
import AgentModeSelector from '@/renderer/components/agent/AgentModeSelector';
import ThoughtDisplay from '@/renderer/components/chat/ThoughtDisplay';
import { getChatRailSurfaceStyle } from '@/renderer/utils/ui/contentRail';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AionrsModelSelection } from './useAionrsModelSelection';
import { useAionrsMessage } from './useAionrsMessage';
import { useConversationRuntimeView } from '@/renderer/pages/conversation/runtime/useConversationRuntimeView';
import { runtimeSummaryForActiveSend } from '@/renderer/pages/conversation/utils/conversationRuntime';
import { useTeamPermission } from '@/renderer/pages/team/hooks/TeamPermissionContext';
import { warmupConversation } from '@/renderer/pages/conversation/utils/warmupConversation';

const useAionrsSendBoxDraft = getSendBoxDraftHook('aionrs', {
  _type: 'aionrs',
  atPath: [],
  content: '',
  uploadFile: [],
});

const EMPTY_AT_PATH: Array<string | FileOrFolderItem> = [];
const EMPTY_UPLOAD_FILES: string[] = [];

const useSendBoxDraft = (conversation_id: string) => {
  const { data, mutate } = useAionrsSendBoxDraft(conversation_id);

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

const AionrsSendBox: React.FC<{
  conversation_id: string;
  modelSelection: AionrsModelSelection;
  teamId?: string;
  tenantId?: string;
  agentSlotId?: string;
}> = ({ conversation_id, modelSelection, teamId, tenantId, agentSlotId }) => {
  const conversationContext = useConversationContextSafe();
  const effectiveWorkspace = useEffectiveWorkspace(conversation_id);
  const { t } = useTranslation();
  const teamPermission = useTeamPermission();
  const stretchLayout = Boolean(conversationContext?.stretchLayout);
  const { checkAndUpdateTitle } = useAutoTitle();
  const isCommandQueueEnabled = useCommandQueueEnabled();

  const { currentModel, getDisplayModelName } = modelSelection;

  const { thought, running, hasHydratedRunningState, tokenUsage, setActiveMsgId, setWaitingResponse, resetState } =
    useAionrsMessage(conversation_id);
  const runtimeView = useConversationRuntimeView(conversation_id);

  useEffect(() => {
    if (!conversation_id) return;
    void warmupConversation(conversation_id).catch(() => {
      // Warmup is best-effort; send path still works without it.
    });
  }, [conversation_id]);

  const { atPath, uploadFile, setAtPath, setUploadFile, content, setContent } = useSendBoxDraft(conversation_id);

  const slashCommands = useSlashCommands(conversation_id);

  const addOrUpdateMessage = useAddOrUpdateMessage();
  const removeMessageByMsgId = useRemoveMessageByMsgId();
  const { setSendBoxHandler } = usePreviewContext();
  const isBusy =
    running ||
    (!teamId &&
      runtimeView.hydrated &&
      (!runtimeView.canSendMessage || runtimeView.isProcessing || runtimeView.view.localSubmitting));
  const showModeSelector = !teamPermission || conversation_id === teamPermission.leadConversationId;

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
            emitter.emit('aionrs.workspace.refresh');
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
        const result = await ipcBridge.conversation.sendMessage.invoke({
          input: displayMessage,
          msg_id,
          conversation_id,
          files,
        });
        assertBridgeSuccess(result, 'Failed to send message to Aion CLI');
        runtimeView.markSendAccepted(msg_id, runtimeSummaryForActiveSend(msg_id), msg_id);
        patchSentMessageContent(addOrUpdateMessage, conversation_id, msg_id, result);
        emitter.emit('chat.history.refresh');
        if (files.length > 0) {
          emitter.emit('aionrs.workspace.refresh');
        }
      } catch (error) {
        runtimeView.markSendFailed(error instanceof Error ? error.message : String(error));
        setWaitingResponse(false);
        setActiveMsgId(null);
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

  // Handle initial message from Guid page
  useEffect(() => {
    if (!conversation_id) return;

    const storageKey = `aionrs_initial_message_${conversation_id}`;
    const processedKey = `aionrs_initial_processed_${conversation_id}`;

    const processInitialMessage = async () => {
      if (sessionStorage.getItem(processedKey)) return;
      const storedMessage = sessionStorage.getItem(storageKey);
      if (!storedMessage) return;

      sessionStorage.setItem(processedKey, '1');
      sessionStorage.removeItem(storageKey);

      try {
        const { input, files: initialFiles } = JSON.parse(storedMessage);
        await executeCommand({ input, files: initialFiles || [] });
      } catch (error) {
        console.error('[AionrsSendBox] Failed to send initial message:', error);
        sessionStorage.removeItem(processedKey);
      }
    };

    void processInitialMessage();
  }, [conversation_id, executeCommand]);

  const onSendHandler = async (message: string) => {
    if (!isCommandQueueEnabled && isBusy) {
      Message.warning(t('messages.conversationInProgress'));
      return;
    }

    const filesToSend = collectSelectedFiles(uploadFile, atPath);

    // aionrs backend doesn't natively support image vision. Images are auto-
    // described via the configured model's vision API before sending (see
    // AionrsManager.sendMessage + visionDescribe service), so the agent
    // receives image content as text. This is a heads-up, not a blocker.
    const imageFiles = filesToSend.filter((f) => isImageFilePath(f));
    if (imageFiles.length > 0) {
      Message.info(t('conversation.aionrsImageAutoDescribe'));
    }

    clearFiles();
    emitter.emit('aionrs.selected.file.clear');

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

  useAddEventListener('aionrs.selected.file', setAtPath);
  useAddEventListener('aionrs.selected.file.append', (selectedItems: Array<string | FileOrFolderItem>) => {
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
      <ThoughtDisplay thought={thought} running={running} onStop={handleStop} />
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
        disabled={!teamId && !currentModel?.useModel}
        placeholder={
          teamId
            ? t('team.sendBox.placeholder')
            : currentModel?.useModel
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
            {showModeSelector ? (
              <AgentModeSelector
                backend='aionrs'
                conversationId={conversation_id}
                compact={!!teamId}
                hideAgentName
                compactLeadingIcon={<Shield theme='outline' size='14' fill={iconColors.secondary} />}
                modeLabelFormatter={(mode) => t(`agentMode.${mode.value}`, { defaultValue: mode.label })}
                compactLabelPrefix={t('agentMode.permission')}
                hideCompactLabelPrefixOnMobile
              />
            ) : null}
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
                          emitter.emit('aionrs.selected.file', newAtPath);
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
                          emitter.emit('aionrs.selected.file', newAtPath);
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
      />
    </div>
  );
};

export default AionrsSendBox;
