// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LoginMethodSwitcher from '@/renderer/pages/login/components/LoginMethodSwitcher';

const t = (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key;

describe('LoginMethodSwitcher', () => {
  it('switches between local and ldap when ldap is enabled', () => {
    const onChange = vi.fn();

    render(
      <LoginMethodSwitcher
        value='local'
        onChange={onChange}
        ldapEnabled
        ldapConfigured
        methodHint='使用系统本地账户登录'
        t={t}
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: 'LDAP 域控' }));
    expect(onChange).toHaveBeenCalledWith('ldap');
  });

  it('still emits ldap selection when ldap tab is clicked', () => {
    const onChange = vi.fn();

    render(
      <LoginMethodSwitcher
        value='local'
        onChange={onChange}
        ldapEnabled={false}
        ldapConfigured
        methodHint='使用系统本地账户登录'
        t={t}
      />
    );

    fireEvent.click(screen.getByRole('tab', { name: 'LDAP 域控' }));
    expect(onChange).toHaveBeenCalledWith('ldap');
  });
});
