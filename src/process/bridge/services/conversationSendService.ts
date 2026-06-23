/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import {
  buildDisplayMessage,
  isCacheTempFilePath,
  isImageFilePath,
  stripFilesMarker,
} from '@/common/chat/messageFiles';
import type { IAgentManager } from '@process/task/IAgentManager';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import type { GeminiAgentManager } from '@process/task/GeminiAgentManager';
import type { TProviderWithModel } from '@/common/config/storage';
import { prepareFirstMessage } from '@process/task/agentUtils';
import { copyFilesToDirectory } from '@process/utils';
import { compressImagesInPlace } from '@process/services/imageCompress';
import { buildPromptAugmentationPrefix, composeAgentPrompt } from '@process/services/promptAugmentation';
import { getBuiltinSkillsCopyDir, getSkillsDir, getSystemDir, ProcessConfig } from '@process/utils/initStorage';
import fs from 'fs';
import path from 'path';

export type SendConversationMessageParams = {
  conversation_id: string;
  input: string;
  msg_id: string;
  files?: string[];
  loading_id?: string;
  injectSkills?: string[];
};

export type SendConversationMessageResult = {
  success: boolean;
  msg?: string;
  data?: { input: string; files: string[] };
};

async function resolveWorkspaceFiles(task: IAgentManager, files: string[] | undefined): Promise<string[]> {
  const isGeminiAgent = task.type === 'gemini';
  const isAionrsAgent = task.type === 'aionrs';
  const cacheDir = getSystemDir().cacheDir;
  const hasTempUploads = (files ?? []).some((filePath) => isCacheTempFilePath(filePath, cacheDir));

  if (isGeminiAgent || isAionrsAgent || hasTempUploads) {
    try {
      const workspaceFiles = await copyFilesToDirectory(task.workspace, files ?? [], false, cacheDir);
      if (workspaceFiles.length > 0) {
        return compressImagesInPlace(workspaceFiles);
      }
      return workspaceFiles;
    } catch (error) {
      console.error('[conversationSendService] failed to copy files to workspace:', error);
      return [];
    }
  }

  return (files ?? []).filter((filePath) => path.isAbsolute(filePath));
}

async function resolveVisionModel(task: IAgentManager): Promise<TProviderWithModel | undefined> {
  if (task.type !== 'aionrs' && task.type !== 'gemini') {
    return undefined;
  }
  const manager = task as IAgentManager & { model?: TProviderWithModel };
  const chatModel = manager.model?.apiKey && manager.model.useModel ? manager.model : undefined;
  // The chat model handles vision directly when it is natively multimodal
  // (Kimi K2.6 / Qwen-VL / Gemini etc.). Otherwise fall back to any configured
  // vision-capable provider so scanned-PDF OCR and video keyframes still work.
  const { modelLooksMultimodal, resolveFallbackVisionModel } = await import('@process/services/visionModelResolver');
  if (chatModel && modelLooksMultimodal(chatModel.useModel)) {
    return chatModel;
  }
  const fallback = await resolveFallbackVisionModel(chatModel).catch((): TProviderWithModel | undefined => undefined);
  return fallback ?? chatModel;
}

function scheduleWorkspaceFileCleanup(task: IAgentManager, workspaceFiles: string[]): void {
  if (workspaceFiles.length === 0) {
    return;
  }

  void ProcessConfig.get('upload.saveToWorkspace')
    .catch(() => false)
    .then((saveToWorkspace) => {
      if (saveToWorkspace) {
        return;
      }

      const conversationId = task.conversation_id;
      const filesToCleanup = [...workspaceFiles];
      const resolvedWorkspace = path.resolve(task.workspace);
      const cleanup = () => {
        for (const filePath of filesToCleanup) {
          if (isImageFilePath(filePath)) {
            continue;
          }
          const resolvedFile = path.resolve(filePath);
          if (resolvedFile.startsWith(resolvedWorkspace + path.sep)) {
            fs.promises.unlink(filePath).catch((cleanupError) => {
              console.warn('[conversationSendService] Failed to cleanup file:', filePath, cleanupError);
            });
          }
        }
      };

      if (task.type === 'gemini') {
        const geminiTask = task as unknown as GeminiAgentManager;
        const handleMessage = (data: { type: string }) => {
          if (data.type !== 'finish') {
            return;
          }
          geminiTask.off('gemini.message', handleMessage);
          cleanup();
        };
        geminiTask.on('gemini.message', handleMessage);
        return;
      }

      if (task.type === 'acp') {
        const off = ipcBridge.acpConversation.responseStream.on((msg) => {
          if (msg.conversation_id !== conversationId || msg.type !== 'finish') {
            return;
          }
          off();
          cleanup();
        });
        return;
      }

      const off = ipcBridge.conversation.responseStream.on((msg) => {
        if (msg.conversation_id !== conversationId || msg.type !== 'finish') {
          return;
        }
        off();
        cleanup();
      });
    });
}

export async function sendConversationMessage(
  workerTaskManager: IWorkerTaskManager,
  params: SendConversationMessageParams
): Promise<SendConversationMessageResult> {
  const { conversation_id, files, ...other } = params;
  let task: IAgentManager | undefined;
  try {
    task = await workerTaskManager.getOrBuildTask(conversation_id);
  } catch (err) {
    console.error(`[conversationSendService] failed to get/build task: ${conversation_id}`, err);
    return {
      success: false,
      msg: err instanceof Error ? err.message : 'conversation not found',
    };
  }

  if (!task) {
    return { success: false, msg: 'conversation not found' };
  }

  const workspaceFiles = await resolveWorkspaceFiles(task, files);
  const textOnly = stripFilesMarker(other.input);
  const resolvedInput =
    workspaceFiles.length > 0 ? buildDisplayMessage(textOnly, workspaceFiles, task.workspace) : textOnly;

  let agentContent = resolvedInput;
  if (other.injectSkills?.length) {
    agentContent = await prepareFirstMessage(textOnly, {
      enabledSkills: other.injectSkills,
    });
    const skillsDir = getSkillsDir();
    const builtinSkillsCopyDir = getBuiltinSkillsCopyDir();
    agentContent = agentContent.replace(
      '[User Request]',
      `[Skills Directory]\nBuiltin skills: ${builtinSkillsCopyDir}\nUser skills: ${skillsDir}\nWhen skill instructions reference relative paths like "skills/{name}/scripts/...", resolve them under the appropriate directory.\n\n[User Request]`
    );
  }

  const augmentationPrefix = await buildPromptAugmentationPrefix({
    displayContent: agentContent,
    files: workspaceFiles,
    visionModel: await resolveVisionModel(task),
  });
  const agentPrompt = composeAgentPrompt(agentContent, augmentationPrefix);

  try {
    await task.sendMessage({
      ...other,
      input: resolvedInput,
      content: resolvedInput,
      agentContent,
      agentPrompt,
      files: workspaceFiles,
    });
    scheduleWorkspaceFileCleanup(task, workspaceFiles);
    return { success: true, data: { input: resolvedInput, files: workspaceFiles } };
  } catch (err: unknown) {
    return {
      success: false,
      msg: err instanceof Error ? err.message : String(err),
    };
  }
}
