/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

export { buildDisplayMessage, stripFilesMarker } from '@/common/chat/messageFiles';
import type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';

export const collectSelectedFiles = (uploadFile: string[], atPath: Array<string | FileOrFolderItem>): string[] => {
  const atPathFiles = atPath.map((item) => (typeof item === 'string' ? item : item.path)).filter(Boolean);
  return Array.from(new Set([...uploadFile, ...atPathFiles]));
};
