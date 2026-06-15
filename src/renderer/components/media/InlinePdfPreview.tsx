/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { ipcBridge } from '@/common';

type InlinePdfPreviewProps = {
  path: string;
  fileName: string;
  height?: number;
};

const InlinePdfPreview: React.FC<InlinePdfPreviewProps> = ({ path, fileName, height = 240 }) => {
  const [src, setSrc] = useState<string>('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;

    const load = async () => {
      try {
        const buffer = await ipcBridge.fs.readFileBuffer.invoke({ path });
        if (cancelled) return;
        const blob = new Blob([buffer], { type: 'application/pdf' });
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
        setFailed(false);
      } catch (error) {
        console.warn('[InlinePdfPreview] Failed to load PDF preview:', path, error);
        if (!cancelled) {
          setFailed(true);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [path]);

  if (failed || !src) {
    return (
      <div
        className='flex items-center justify-center rd-8px border-1 border-solid b-color-border-2 bg-bg-2 text-12px text-t-secondary'
        style={{ width: 220, height }}
      >
        PDF
      </div>
    );
  }

  return (
    <div className='rd-8px overflow-hidden border-1 border-solid b-color-border-2 bg-bg-1' style={{ width: 220 }}>
      <iframe
        title={fileName}
        src={src}
        className='w-full border-0'
        style={{ height, display: 'block' }}
      />
    </div>
  );
};

export default InlinePdfPreview;
