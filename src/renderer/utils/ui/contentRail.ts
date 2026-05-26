import type { CSSProperties } from 'react';

export const CONTENT_RAIL = {
  mobileInlinePadding: 16,
  desktopInlinePadding: 24,
  mobileBleed: 14,
  guidMaxWidth: 960,
  guidInnerMaxWidth: 880,
  chatMessageMaxWidth: 920,
  chatSurfaceMaxWidth: 960,
} as const;

type RailSurfaceKind = 'message' | 'surface';

export const CHAT_RAIL_INLINE_PADDING_CLASS = 'px-16px md:px-24px';

export function getGuidRailStyle(): CSSProperties {
  return {
    '--content-rail-max-width': `${CONTENT_RAIL.guidMaxWidth}px`,
    '--content-rail-inner-max-width': `${CONTENT_RAIL.guidInnerMaxWidth}px`,
    '--content-rail-inline-padding-mobile': `${CONTENT_RAIL.mobileInlinePadding}px`,
    '--content-rail-inline-padding-desktop': `${CONTENT_RAIL.desktopInlinePadding}px`,
  } as CSSProperties;
}

export function getChatRailSurfaceStyle(kind: RailSurfaceKind, stretchLayout: boolean): CSSProperties {
  if (stretchLayout) {
    return { width: '100%' };
  }

  return {
    width: '100%',
    maxWidth: kind === 'message' ? CONTENT_RAIL.chatMessageMaxWidth : CONTENT_RAIL.chatSurfaceMaxWidth,
  };
}

export function getMobileRailBleedStyle(isMobile: boolean): CSSProperties | undefined {
  if (!isMobile) {
    return undefined;
  }

  return {
    width: `calc(100% + ${CONTENT_RAIL.mobileBleed * 2}px)`,
    marginLeft: -CONTENT_RAIL.mobileBleed,
    marginRight: -CONTENT_RAIL.mobileBleed,
  };
}
