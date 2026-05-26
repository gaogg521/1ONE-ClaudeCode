import { describe, expect, it } from 'vitest';

import {
  CONTENT_RAIL,
  getChatRailSurfaceStyle,
  getGuidRailStyle,
  getMobileRailBleedStyle,
} from '@/renderer/utils/ui/contentRail';

describe('contentRail', () => {
  it('exposes one source of truth for guid rail widths', () => {
    expect(getGuidRailStyle()).toMatchObject({
      '--content-rail-max-width': `${CONTENT_RAIL.guidMaxWidth}px`,
      '--content-rail-inner-max-width': `${CONTENT_RAIL.guidInnerMaxWidth}px`,
      '--content-rail-inline-padding-mobile': `${CONTENT_RAIL.mobileInlinePadding}px`,
      '--content-rail-inline-padding-desktop': `${CONTENT_RAIL.desktopInlinePadding}px`,
    });
  });

  it('returns centered constrained styles for message and surface rails', () => {
    expect(getChatRailSurfaceStyle('message', false)).toEqual({
      width: '100%',
      maxWidth: CONTENT_RAIL.chatMessageMaxWidth,
    });

    expect(getChatRailSurfaceStyle('surface', false)).toEqual({
      width: '100%',
      maxWidth: CONTENT_RAIL.chatSurfaceMaxWidth,
    });
  });

  it('returns full-width styles when stretch layout is enabled', () => {
    expect(getChatRailSurfaceStyle('message', true)).toEqual({ width: '100%' });
    expect(getChatRailSurfaceStyle('surface', true)).toEqual({ width: '100%' });
  });

  it('uses the shared bleed rule for mobile welcome surfaces', () => {
    expect(getMobileRailBleedStyle(true)).toEqual({
      width: `calc(100% + ${CONTENT_RAIL.mobileBleed * 2}px)`,
      marginLeft: -CONTENT_RAIL.mobileBleed,
      marginRight: -CONTENT_RAIL.mobileBleed,
    });

    expect(getMobileRailBleedStyle(false)).toBeUndefined();
  });
});
