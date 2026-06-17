/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { Close } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { getFileExtension } from '@/renderer/services/FileService';
import { extname } from '@/common/chat/pathUtils';
import { ipcBridge } from '@/common';
import { Image, Spin } from '@arco-design/web-react';
import fileIcon from '@/renderer/assets/icons/file-icon.svg';
import InlinePdfPreview from '@/renderer/components/media/InlinePdfPreview';

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg']);

const IMAGE_NOT_FOUND_B64_MARKER = 'kltYWdlIG5vdCBmb3VuZD';
const MAX_IMAGE_RETRIES = 5;
const IMAGE_RETRY_DELAY_MS = 800;

const isImageFile = (path: string): boolean => {
  const ext = path.toLowerCase().slice(path.lastIndexOf('.'));
  return IMAGE_EXTS.has(ext);
};

const formatFileSize = (bytes: number): string => {
  if (bytes <= 0) return '...';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
};

type FilePreviewVariant = 'thumb' | 'chat';

interface FilePreviewProps {
  path: string;
  onRemove: () => void;
  readonly?: boolean;
  conversationId?: string;
  variant?: FilePreviewVariant;
}

const FilePreview: React.FC<FilePreviewProps> = ({
  path,
  onRemove,
  readonly = false,
  conversationId,
  variant = 'thumb',
}) => {
  if (typeof path !== 'string') {
    console.error('[FilePreview] Invalid path type:', typeof path, path);
    return null;
  }

  const isChat = variant === 'chat';
  const isImage = isImageFile(path);
  const isPdf = extname(path) === '.pdf';
  const fileName = path.split(/[\\/]/).pop() || '';
  const fileExt = getFileExtension(path).toUpperCase().replace('.', '');
  const [imageUrl, setImageUrl] = useState<string>('');
  const [fileSize, setFileSize] = useState<string>('');
  const [resolvedPath, setResolvedPath] = useState(path);
  const [resolvingPath, setResolvingPath] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setResolvingPath(true);
    void ipcBridge.fs.resolveAttachmentDisplayPath
      .invoke({ path, conversationId })
      .then((nextPath) => {
        if (!cancelled) {
          setResolvedPath(nextPath);
          setResolvingPath(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedPath(path);
          setResolvingPath(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path, conversationId]);

  useEffect(() => {
    if (resolvingPath) {
      return undefined;
    }

    ipcBridge.fs.getFileMetadata
      .invoke({ path: resolvedPath })
      .then((metadata) => {
        setFileSize(formatFileSize(metadata.size));
      })
      .catch((error) => {
        console.error('[FilePreview] Failed to get file metadata:', { path: resolvedPath, error });
      });

    if (isImage) {
      let cancelled = false;
      let retryCount = 0;
      let retryTimer: ReturnType<typeof setTimeout>;

      const loadImage = () => {
        ipcBridge.fs.getImageBase64
          .invoke({ path: resolvedPath })
          .then((base64) => {
            if (cancelled) return;
            if (base64.includes(IMAGE_NOT_FOUND_B64_MARKER) && retryCount < MAX_IMAGE_RETRIES) {
              retryCount++;
              retryTimer = setTimeout(loadImage, IMAGE_RETRY_DELAY_MS);
            } else {
              setImageUrl(base64);
            }
          })
          .catch((error) => {
            if (cancelled) return;
            console.error('[FilePreview] Failed to load image:', { path: resolvedPath, error });
          });
      };

      loadImage();

      return () => {
        cancelled = true;
        clearTimeout(retryTimer);
      };
    }

    return undefined;
  }, [resolvedPath, isImage, resolvingPath]);

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove();
  };

  if (isPdf && readonly) {
    return (
      <div className='relative inline-block'>
        <InlinePdfPreview
          path={resolvedPath}
          fileName={fileName}
          conversationId={conversationId}
          height={isChat ? 320 : 240}
          width={isChat ? 320 : 220}
        />
      </div>
    );
  }

  if (isImage) {
    const thumbSize = 60;
    const chatMaxWidth = 280;
    const chatMaxHeight = 240;

    return (
      <div className='relative inline-block'>
        <div className='rd-8px overflow-hidden border-1 border-solid b-color-border-2'>
          {resolvingPath || !imageUrl ? (
            <div
              className='flex items-center justify-center bg-bg-3'
              style={{
                width: isChat ? chatMaxWidth : thumbSize,
                height: isChat ? chatMaxHeight : thumbSize,
                minWidth: isChat ? 120 : thumbSize,
                minHeight: isChat ? 120 : thumbSize,
              }}
            >
              <Spin size={16} />
            </div>
          ) : (
            <Image
              src={imageUrl}
              alt={fileName}
              width={isChat ? undefined : thumbSize}
              height={isChat ? undefined : thumbSize}
              className={
                isChat ? 'max-w-280px max-h-240px object-contain cursor-pointer' : 'object-cover cursor-pointer'
              }
              style={
                isChat
                  ? { display: 'block', maxWidth: chatMaxWidth, maxHeight: chatMaxHeight }
                  : { display: 'block', width: thumbSize, height: thumbSize }
              }
              preview
            />
          )}
        </div>
        {!readonly && (
          <div
            className='absolute -top-4px -right-4px w-16px h-16px rd-50% bg-white dark:bg-gray-700 cursor-pointer flex items-center justify-center shadow-md hover:shadow-lg transition-all z-10 border-1 border-solid border-gray-200 dark:border-gray-600'
            onClick={handleRemove}
          >
            <Close theme='filled' size='10' fill='var(--color-text-3)' />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className='relative inline-block mb-10px'>
      <div
        className='h-60px flex items-center gap-12px px-12px rd-8px bg-bg-2 border border-solid'
        style={{ borderColor: 'var(--border-base)', boxShadow: '0 0 0 1px rgba(0,0,0,0.02)' }}
      >
        <div className='w-40px h-40px rd-8px flex items-center justify-center flex-shrink-0'>
          <img className='w-full h-full object-contain' src={fileIcon} alt='File Icon' />
        </div>
        <div className='flex flex-col gap-2px min-w-0'>
          <span className='text-14px text-t-primary max-w-150px truncate'>{fileName}</span>
          <span className='text-12px text-t-secondary'>
            {fileExt}: {fileSize || '...'}
          </span>
        </div>
      </div>
      {!readonly && (
        <div
          className='absolute -top-4px -right-4px w-16px h-16px rd-50% bg-white dark:bg-gray-700 cursor-pointer flex items-center justify-center shadow-md hover:shadow-lg transition-all z-10 border-1 border-solid border-gray-200 dark:border-gray-600'
          onClick={handleRemove}
        >
          <Close theme='filled' size='10' fill='var(--color-text-3)' />
        </div>
      )}
    </div>
  );
};

export default FilePreview;
