/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import AgentModalContent from '@/renderer/components/settings/SettingsModal/contents/AgentModalContent';
import { SettingsViewModeProvider } from '@/renderer/components/settings/SettingsModal/settingsViewContext';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en-US' },
  }),
}));

vi.mock('@/renderer/pages/settings/AgentSettings/LocalAgents', () => ({
  default: () => <div data-testid='local-agents'>local</div>,
}));

vi.mock('@/renderer/pages/settings/AgentSettings/RemoteAgents', () => ({
  default: () => <div data-testid='remote-agents'>remote</div>,
}));

vi.mock('@/renderer/components/base/AionScrollArea', () => ({
  default: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

function renderAgentSettings(initialEntry: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/settings/agent',
        element: (
          <SettingsViewModeProvider value='page'>
            <AgentModalContent />
          </SettingsViewModeProvider>
        ),
      },
    ],
    { initialEntries: [initialEntry] }
  );

  render(<RouterProvider router={router} />);
  return router;
}

describe('AgentModalContent', () => {
  it('opens the remote tab when tab=remote is in the URL', () => {
    renderAgentSettings('/settings/agent?tab=remote');
    expect(screen.getByTestId('remote-agents')).toBeInTheDocument();
    expect(screen.queryByTestId('local-agents')).not.toBeInTheDocument();
  });

  it('defaults to the local tab when tab is missing or local', () => {
    renderAgentSettings('/settings/agent?tab=local');
    expect(screen.getByTestId('local-agents')).toBeInTheDocument();
    expect(screen.queryByTestId('remote-agents')).not.toBeInTheDocument();
  });

  it('updates the URL when switching to the remote tab', async () => {
    const user = userEvent.setup();
    const router = renderAgentSettings('/settings/agent');

    await user.click(screen.getByRole('tab', { name: 'settings.agentManagement.remoteAgents' }));

    expect(screen.getByTestId('remote-agents')).toBeInTheDocument();
    expect(router.state.location.search).toContain('tab=remote');
  });
});
