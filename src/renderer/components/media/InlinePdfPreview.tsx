/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { ipcBridge } from '@/common';
import { Spin } from '@arco-design/web-react';

type InlinePdfPreviewProps = {
  path: string;
  fileName: string;
  height?: number;
  width?: number;
  conversationId?: string;
};

const MAX_RETRIES = 4;
const RETRY_DELAY_MS = 600;

const InlinePdfPreview: React.FC<InlinePdfPreviewProps> = ({
  path,
  fileName,
  height = 240,
  width = 220,
  conversationId,
}) => {
  const [src, setSrc] = useState<string>('');
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [resolvedPath, setResolvedPath] = useState(path);

  useEffect(() => {
    let cancelled = false;
    void ipcBridge.fs.resolveAttachmentDisplayPath
      .invoke({ path, conversationId })
      .then((nextPath) => {
        if (!cancelled) {
          setResolvedPath(nextPath);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedPath(path);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path, conversationId]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;
    let retryTimer: ReturnType<typeof setTimeout>;
    let retryCount = 0;

    const load = async () => {
      setLoading(true);
      setFailed(false);
      try {
        const buffer = await ipcBridge.fs.readFileBuffer.invoke({ path: resolvedPath });
        if (cancelled) return;
        if (!buffer || buffer.byteLength === 0) {
          if (retryCount < MAX_RETRIES) {
            retryCount++;
            retryTimer = setTimeout(() => {
              void load();
            }, RETRY_DELAY_MS);
            return;
          }
          setFailed(true);
          setLoading(false);
          return;
        }
        const blob = new Blob([buffer], { type: 'application/pdf' });
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
        setFailed(false);
        setLoading(false);
      } catch (error) {
        console.warn('[InlinePdfPreview] Failed to load PDF preview:', resolvedPath, error);
        if (cancelled) return;
        if (retryCount < MAX_RETRIES) {
          retryCount++;
          retryTimer = setTimeout(() => {
            void load();
          }, RETRY_DELAY_MS);
          return;
        }
        setFailed(true);
        setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [resolvedPath]);

  if (loading) {
    return (
      <div
        className='flex items-center justify-center rd-8px border-1 border-solid b-color-border-2 bg-bg-2'
        style={{ width, height }}
      >
        <Spin size={18} />
      </div>
    );
  }

  if (failed || !src) {
    return (
      <div
        className='flex flex-col items-center justify-center gap-4px rd-8px border-1 border-solid b-color-border-2 bg-bg-2 text-12px text-t-secondary px-8px text-center'
        style={{ width, height }}
      >
        <span>PDF</span>
        <span className='truncate max-w-full opacity-70'>{fileName}</span>
      </div>
    );
  }

  return (
    <div className='rd-8px overflow-hidden border-1 border-solid b-color-border-2 bg-bg-1' style={{ width }}>
      <iframe title={fileName} src={src} className='w-full border-0' style={{ height, display: 'block' }} />
    </div>
  );
};

export default InlinePdfPreview;
