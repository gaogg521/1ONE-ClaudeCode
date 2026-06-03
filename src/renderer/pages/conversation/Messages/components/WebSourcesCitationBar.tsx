/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { Link } from '@arco-design/web-react';
import { IconDown, IconRight } from '@arco-design/web-react/icon';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { WebSourceItem } from '@/renderer/utils/web/collectWebSourcesFromTools';
import styles from './WebSourcesCitationBar.module.css';

type WebSourcesCitationBarProps = {
  sources: WebSourceItem[];
};

const WebSourcesCitationBar: React.FC<WebSourcesCitationBarProps> = ({ sources }) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);

  if (sources.length === 0) {
    return null;
  }

  const count = sources.length;

  return (
    <div className={styles.bar} data-testid='web-sources-citation-bar'>
      <div
        className={styles.toggle}
        role='button'
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
      >
        {expanded ? <IconDown style={{ fontSize: 12 }} /> : <IconRight style={{ fontSize: 12 }} />}
        <span>{t('conversation.webSources.analysisDone', { count })}</span>
      </div>
      {expanded && (
        <div className={styles.sourceList}>
          {sources.map((source, index) => (
            <div key={source.url} className={styles.sourceItem}>
              <span className={styles.sourceIndex}>{index + 1}.</span>
              <Link
                className={styles.sourceLink}
                href={source.url}
                target='_blank'
                rel='noopener noreferrer'
                title={source.url}
              >
                {source.title}
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default React.memo(WebSourcesCitationBar);
