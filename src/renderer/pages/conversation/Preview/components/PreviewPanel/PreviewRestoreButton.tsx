import { iconColors } from '@/renderer/styles/colors';
import { ExpandLeft } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

type PreviewRestoreButtonProps = {
  tabCount: number;
  activeTitle?: string;
  onRestore: () => void;
  /** Offset from the right edge when another floating control shares the corner */
  rightOffsetPx?: number;
};

/** Floating chip to reopen a collapsed preview panel without losing open tabs */
const PreviewRestoreButton: React.FC<PreviewRestoreButtonProps> = ({
  tabCount,
  activeTitle,
  onRestore,
  rightOffsetPx = 16,
}) => {
  const { t } = useTranslation();
  const label =
    tabCount === 1 && activeTitle
      ? t('preview.restorePanelWithTitle', { title: activeTitle })
      : t('preview.restorePanelWithCount', { count: tabCount });

  return (
    <button
      type='button'
      className='preview-restore-floating absolute z-20 flex items-center gap-8px px-12px py-8px rd-10px cursor-pointer transition-colors'
      style={{
        bottom: '16px',
        right: `${rightOffsetPx}px`,
        backgroundColor: 'var(--bg-2)',
        border: '1px solid var(--bg-3)',
        boxShadow: '0 8px 20px rgba(0, 0, 0, 0.12)',
        maxWidth: 'min(280px, calc(100% - 32px))',
      }}
      onClick={onRestore}
      aria-label={label}
      title={label}
    >
      <ExpandLeft theme='outline' size={16} fill={iconColors.secondary} />
      <span className='text-12px text-t-primary truncate'>{label}</span>
    </button>
  );
};

export default PreviewRestoreButton;
