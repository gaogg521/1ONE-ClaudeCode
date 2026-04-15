/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { SpeechToTextResult } from '@/common/types/speech';
import { isElectronDesktop } from '@/renderer/utils/platform';

const MAX_AUDIO_FILE_SIZE_MB = 30;
const MAX_AUDIO_FILE_SIZE_BYTES = MAX_AUDIO_FILE_SIZE_MB * 1024 * 1024;
const TRANSCRIBE_TIMEOUT_MS = 65_000;

const getAudioExtension = (mimeType: string) => {
  switch (mimeType) {
    case 'audio/mp4':
    case 'audio/x-m4a':
      return 'm4a';
    case 'audio/mpeg':
      return 'mp3';
    case 'audio/ogg':
    case 'audio/ogg;codecs=opus':
      return 'ogg';
    case 'audio/wav':
    case 'audio/wave':
      return 'wav';
    default:
      return 'webm';
  }
};

const createAudioFileName = (mimeType: string) => {
  return `speech-input.${getAudioExtension(mimeType)}`;
};

const ensureAudioSize = (blob: Blob) => {
  if (blob.size > MAX_AUDIO_FILE_SIZE_BYTES) {
    throw new Error('STT_FILE_TOO_LARGE');
  }
};

const parseWebResponse = async (response: XMLHttpRequest): Promise<SpeechToTextResult> => {
  const payload = JSON.parse(response.responseText) as {
    data?: SpeechToTextResult;
    msg?: string;
    success: boolean;
  };

  if (!payload.success || !payload.data) {
    throw new Error(payload.msg || 'STT_REQUEST_FAILED');
  }

  return payload.data;
};

const parseWebError = (response: XMLHttpRequest): Error => {
  try {
    const payload = JSON.parse(response.responseText) as { msg?: string };
    if (payload.msg) {
      return new Error(payload.msg);
    }
  } catch {
    // ignore json parse failure
  }
  return new Error(`STT_REQUEST_FAILED:${response.status} ${response.statusText}`);
};

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: number | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = window.setTimeout(() => reject(new Error('STT_NETWORK_ERROR:timeout')), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) {
      window.clearTimeout(timer);
    }
  }
};

export async function transcribeAudioBlob(blob: Blob, languageHint?: string): Promise<SpeechToTextResult> {
  ensureAudioSize(blob);

  const mimeType = blob.type || 'audio/webm';
  const fileName = createAudioFileName(mimeType);

  if (isElectronDesktop()) {
    const audioBuffer = new Uint8Array(await blob.arrayBuffer());
    return withTimeout(
      ipcBridge.speechToText.transcribe.invoke({
        audioBuffer: Array.from(audioBuffer),
        fileName,
        languageHint,
        mimeType,
      }),
      TRANSCRIBE_TIMEOUT_MS
    );
  }

  const formData = new FormData();
  formData.append('audio', blob, fileName);
  formData.append('mimeType', mimeType);
  if (languageHint) {
    formData.append('languageHint', languageHint);
  }

  return withTimeout(
    new Promise<SpeechToTextResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/stt');
    xhr.withCredentials = true;

    xhr.addEventListener('load', () => {
      if (xhr.status === 413) {
        reject(new Error('STT_FILE_TOO_LARGE'));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(parseWebError(xhr));
        return;
      }

      parseWebResponse(xhr).then(resolve).catch(reject);
    });

    xhr.addEventListener('error', () => {
      reject(new Error('STT_NETWORK_ERROR'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('STT_ABORTED'));
    });

    xhr.send(formData);
    }),
    TRANSCRIBE_TIMEOUT_MS
  );
}
