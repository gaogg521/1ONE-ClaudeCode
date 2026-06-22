/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isErrorTipMessage, transformMessage } from '@/common/chat/chatLib';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { TChatConversation, TokenUsageData } from '@/common/config/storage';
import { uuid } from '@/common/utils';
import type { ThoughtData } from '@/renderer/components/chat/ThoughtDisplay';
import { useAddOrUpdateMessage } from '@/renderer/pages/conversation/Messages/hooks';
import {
  useConversationMessageSync,
  useSyncOnRunningComplete,
} from '@/renderer/pages/conversation/Messages/conversationMessageSync';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { processLocalCronResponse } from './localCronCommands';

type TokenUsage = {
  input_tokens?: number;
  output_tokens?: number;
};

/** Poll DB while waiting so packaged builds still show replies without waiting for finish. */
export const AIONRS_MESSAGE_SYNC_POLL_MS = 2500;

export const useAionrsMessage = (
  conversation_id: string,
  options?: {
    onError?: (message: IResponseMessage) => void;
    onConfigChanged?: (capabilities: Record<string, unknown>) => void;
  }
) => {
  const onError = options?.onError;
  const onConfigChanged = options?.onConfigChanged;
  const onConfigChangedRef = useRef(onConfigChanged);
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const scheduleMessageSync = useConversationMessageSync(conversation_id);
  const [streamRunning, setStreamRunning] = useState(false);
  const [hasActiveTools, setHasActiveTools] = useState(false);
  const [waitingResponse, setWaitingResponse] = useState(false);
  const [hasHydratedRunningState, setHasHydratedRunningState] = useState(false);
  const [thought, setThought] = useState<ThoughtData>({
    description: '',
    subject: '',
  });
  const [tokenUsage, setTokenUsage] = useState<TokenUsageData | null>(null);
  const activeMsgIdRef = useRef<string | null>(null);
  const messageBufferRef = useRef(new Map<string, string>());
  const processedCronMsgIdsRef = useRef(new Set<string>());

  const hasActiveToolsRef = useRef(hasActiveTools);
  const streamRunningRef = useRef(streamRunning);
  const waitingResponseRef = useRef(waitingResponse);
  const hasContentInTurnRef = useRef(false);

  useEffect(() => {
    onConfigChangedRef.current = onConfigChanged;
  }, [onConfigChanged]);
  useEffect(() => {
    hasActiveToolsRef.current = hasActiveTools;
  }, [hasActiveTools]);
  useEffect(() => {
    streamRunningRef.current = streamRunning;
  }, [streamRunning]);

  const thoughtThrottleRef = useRef<{
    lastUpdate: number;
    pending: ThoughtData | null;
    timer: ReturnType<typeof setTimeout> | null;
  }>({ lastUpdate: 0, pending: null, timer: null });

  const throttledSetThought = useMemo(() => {
    const THROTTLE_MS = 50;
    return (data: ThoughtData) => {
      const now = Date.now();
      const ref = thoughtThrottleRef.current;

      if (now - ref.lastUpdate >= THROTTLE_MS) {
        ref.lastUpdate = now;
        ref.pending = null;
        if (ref.timer) {
          clearTimeout(ref.timer);
          ref.timer = null;
        }
        setThought(data);
      } else {
        ref.pending = data;
        if (!ref.timer) {
          ref.timer = setTimeout(
            () => {
              ref.lastUpdate = Date.now();
              ref.timer = null;
              if (ref.pending) {
                setThought(ref.pending);
                ref.pending = null;
              }
            },
            THROTTLE_MS - (now - ref.lastUpdate)
          );
        }
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (thoughtThrottleRef.current.timer) {
        clearTimeout(thoughtThrottleRef.current.timer);
      }
    };
  }, []);

  const running = waitingResponse || streamRunning || hasActiveTools;

  const setActiveMsgId = useCallback((msgId: string | null) => {
    activeMsgIdRef.current = msgId;
  }, []);

  const processCompletedAssistantMessage = useCallback(
    async (msgId: string) => {
      if (!msgId || processedCronMsgIdsRef.current.has(msgId)) {
        return;
      }

      const rawContent = messageBufferRef.current.get(msgId) ?? '';
      if (!rawContent.trim()) {
        return;
      }

      processedCronMsgIdsRef.current.add(msgId);

      try {
        const result = await processLocalCronResponse(conversation_id, rawContent);
        if (result.displayContent !== undefined && result.displayContent !== rawContent) {
          addOrUpdateMessage({
            id: uuid(),
            msg_id: msgId,
            type: 'text',
            position: 'left',
            conversation_id,
            createdAt: Date.now(),
            content: {
              content: result.displayContent,
              replace: true,
            },
          });
        }

        for (const response of result.systemResponses) {
          addOrUpdateMessage(
            {
              id: uuid(),
              msg_id: `cron-local-${uuid()}`,
              type: 'tips',
              position: 'center',
              conversation_id,
              createdAt: Date.now(),
              content: {
                content: response,
                type: response.startsWith('❌') ? 'error' : 'success',
              },
            },
            true
          );
        }
      } catch {
        processedCronMsgIdsRef.current.delete(msgId);
      }
    },
    [addOrUpdateMessage, conversation_id]
  );

  useEffect(() => {
    return ipcBridge.conversation.responseStream.on((message) => {
      if (conversation_id !== message.conversation_id) {
        return;
      }

      if (isErrorTipMessage(message)) {
        setStreamRunning(false);
        streamRunningRef.current = false;
        setWaitingResponse(false);
        waitingResponseRef.current = false;
        setHasActiveTools(false);
        hasActiveToolsRef.current = false;
        setThought({ subject: '', description: '' });
        hasContentInTurnRef.current = false;
        const transformedMessage = transformMessage(message);
        if (transformedMessage) {
          addOrUpdateMessage(transformedMessage);
        }
        scheduleMessageSync();
        return;
      }

      if (activeMsgIdRef.current && message.msg_id && message.msg_id !== activeMsgIdRef.current) {
        if (message.type === 'thought') {
          return;
        }
      }

      if ((message.type === 'content' || message.type === 'text') && message.msg_id) {
        const payload = message.data;
        const chunk =
          typeof payload === 'string'
            ? payload
            : typeof payload === 'object' &&
                payload !== null &&
                'content' in payload &&
                typeof (payload as { content?: unknown }).content === 'string'
              ? ((payload as { content: string }).content ?? '')
              : '';

        if (chunk) {
          const previous = messageBufferRef.current.get(message.msg_id) ?? '';
          messageBufferRef.current.set(message.msg_id, previous + chunk);
        }
      }

      switch (message.type) {
        case 'thought':
          if (!streamRunningRef.current) {
            setStreamRunning(true);
            streamRunningRef.current = true;
          }
          throttledSetThought(message.data as ThoughtData);
          break;
        case 'start':
          setStreamRunning(true);
          streamRunningRef.current = true;
          break;
        case 'finish':
          {
            const usageData = message.data as TokenUsage | undefined;
            if (usageData && typeof usageData === 'object' && 'input_tokens' in usageData) {
              const newTokenUsage: TokenUsageData = {
                totalTokens: (usageData.input_tokens || 0) + (usageData.output_tokens || 0),
              };
              setTokenUsage(newTokenUsage);
              void ipcBridge.conversation.update.invoke({
                id: conversation_id,
                updates: {
                  extra: { lastTokenUsage: newTokenUsage } as TChatConversation['extra'],
                },
                mergeExtra: true,
              });
            }
            setStreamRunning(false);
            setWaitingResponse(false);
            setThought({ subject: '', description: '' });
            scheduleMessageSync();
            if (message.msg_id) {
              void processCompletedAssistantMessage(message.msg_id);
            }
          }
          break;
        case 'tool_group':
          {
            hasContentInTurnRef.current = true;

            if (!streamRunningRef.current) {
              setStreamRunning(true);
              streamRunningRef.current = true;
            }

            const tools = message.data as Array<{ status: string; name?: string }>;
            const activeStatuses = new Set(['Executing', 'Confirming', 'Pending']);
            const hasActive = tools.some((tool) => activeStatuses.has(tool.status));
            const wasActive = hasActiveToolsRef.current;

            setHasActiveTools(hasActive);
            hasActiveToolsRef.current = hasActive;

            if (wasActive && !hasActive && tools.length > 0) {
              setWaitingResponse(true);
              waitingResponseRef.current = true;
            }

            const confirmingTool = tools.find((tool) => tool.status === 'Confirming');
            if (confirmingTool) {
              setThought({
                subject: 'Awaiting Confirmation',
                description: confirmingTool.name || 'Tool execution',
              });
            } else if (hasActive) {
              const executingTool = tools.find((tool) => tool.status === 'Executing');
              if (executingTool) {
                setThought({
                  subject: 'Executing',
                  description: executingTool.name || 'Tool',
                });
              }
            } else if (!streamRunningRef.current) {
              setThought({ subject: '', description: '' });
            }

            addOrUpdateMessage(transformMessage(message));
          }
          break;
        case 'permission':
        case 'acp_permission':
          if (!streamRunningRef.current) {
            setStreamRunning(true);
            streamRunningRef.current = true;
          }
          addOrUpdateMessage(transformMessage({ ...message, type: 'permission' }));
          break;
        case 'config_changed':
          onConfigChangedRef.current?.(message.data as Record<string, unknown>);
          break;
        default: {
          if (message.type === 'error') {
            setWaitingResponse(false);
            waitingResponseRef.current = false;
            setStreamRunning(false);
            streamRunningRef.current = false;
            setHasActiveTools(false);
            hasActiveToolsRef.current = false;
            setThought({ subject: '', description: '' });
            hasContentInTurnRef.current = false;
            activeMsgIdRef.current = null;
            scheduleMessageSync();
            onError?.(message as IResponseMessage);
          } else {
            hasContentInTurnRef.current = true;
            if (message.type === 'content') {
              setWaitingResponse(false);
              waitingResponseRef.current = false;
            }
            if (!streamRunningRef.current) {
              setStreamRunning(true);
              streamRunningRef.current = true;
            }
          }
          addOrUpdateMessage(transformMessage(message));
          break;
        }
      }
    });
  }, [
    conversation_id,
    addOrUpdateMessage,
    onError,
    scheduleMessageSync,
    processCompletedAssistantMessage,
    throttledSetThought,
  ]);

  useEffect(() => {
    let cancelled = false;

    setThought({ subject: '', description: '' });
    setTokenUsage(null);
    hasContentInTurnRef.current = false;
    setHasHydratedRunningState(false);

    void ipcBridge.conversation.get.invoke({ id: conversation_id }).then((res) => {
      if (cancelled) {
        return;
      }

      if (!res) {
        setStreamRunning(false);
        streamRunningRef.current = false;
        setHasActiveTools(false);
        hasActiveToolsRef.current = false;
        setWaitingResponse(false);
        waitingResponseRef.current = false;
        setHasHydratedRunningState(true);
        return;
      }
      const isRunning = res.status === 'running';
      setStreamRunning(isRunning);
      streamRunningRef.current = isRunning;
      setHasActiveTools(false);
      hasActiveToolsRef.current = false;
      setWaitingResponse(isRunning);
      waitingResponseRef.current = isRunning;
      if (res.type === 'aionrs' && res.extra?.lastTokenUsage) {
        const { lastTokenUsage } = res.extra;
        if (lastTokenUsage.totalTokens > 0) {
          setTokenUsage(lastTokenUsage);
        }
      }
      setHasHydratedRunningState(true);
    });

    return () => {
      cancelled = true;
    };
  }, [conversation_id]);

  const resetState = useCallback(() => {
    setWaitingResponse(false);
    waitingResponseRef.current = false;
    setStreamRunning(false);
    streamRunningRef.current = false;
    setHasActiveTools(false);
    hasActiveToolsRef.current = false;
    setThought({ subject: '', description: '' });
    hasContentInTurnRef.current = false;
    activeMsgIdRef.current = null;
  }, []);

  useEffect(() => {
    if (!waitingResponse || streamRunning) {
      return;
    }
    scheduleMessageSync();
    const timer = setInterval(scheduleMessageSync, AIONRS_MESSAGE_SYNC_POLL_MS);
    return () => clearInterval(timer);
  }, [conversation_id, waitingResponse, streamRunning, scheduleMessageSync]);

  useSyncOnRunningComplete(conversation_id, running, scheduleMessageSync);

  return {
    thought,
    setThought,
    running,
    hasHydratedRunningState,
    tokenUsage,
    setActiveMsgId,
    setWaitingResponse,
    resetState,
  };
};
