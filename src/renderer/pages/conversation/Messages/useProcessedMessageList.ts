/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chat/chatLib';
import {
  buildProcessedMessageList,
  type IMessageVO,
  updateProcessedMessageListTail,
} from '@renderer/pages/conversation/Messages/messageListProcess';
import { useMemo, useRef } from 'react';

type ProcessCache = {
  source: TMessage[];
  processed: IMessageVO[];
};

/** Virtuoso row list with incremental tail updates during streaming. */
export function useProcessedMessageList(list: TMessage[]): IMessageVO[] {
  const cacheRef = useRef<ProcessCache | null>(null);

  return useMemo(() => {
    const prev = cacheRef.current;
    if (prev) {
      const patched = updateProcessedMessageListTail(prev.processed, prev.source, list);
      if (patched) {
        cacheRef.current = { source: list, processed: patched };
        return patched;
      }
    }

    const processed = buildProcessedMessageList(list);
    cacheRef.current = { source: list, processed };
    return processed;
  }, [list]);
}
