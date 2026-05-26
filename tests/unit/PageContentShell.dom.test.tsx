import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

import PageContentShell from '@/renderer/components/layout/PageContentShell';

describe('PageContentShell', () => {
  it('renders a shared page shell with a centered content area', () => {
    render(
      <PageContentShell contentClassName='md:max-w-1024px'>
        <div>shell body</div>
      </PageContentShell>
    );

    const shell = screen.getByTestId('page-content-shell');
    const content = screen.getByTestId('page-content-shell-content');

    expect(shell.className).toContain('overflow-y-auto');
    expect(shell.className).toContain('md:px-40px');
    expect(content.className).toContain('mx-auto');
    expect(content.className).toContain('md:max-w-1024px');
    expect(screen.getByText('shell body')).toBeInTheDocument();
  });

  it('renders header content outside the centered content area', () => {
    render(
      <PageContentShell header={<div>shell header</div>}>
        <div>shell body</div>
      </PageContentShell>
    );

    const shell = screen.getByTestId('page-content-shell');
    const header = screen.getByText('shell header');
    const content = screen.getByTestId('page-content-shell-content');

    expect(shell.firstChild).toBe(header);
    expect(content).toContainElement(screen.getByText('shell body'));
  });
});
