/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import EnterpriseRouteErrorFallback from '@/renderer/pages/enterprise/components/EnterpriseRouteErrorFallback';

type EnterpriseRouteErrorBoundaryProps = {
  children: React.ReactNode;
};

type EnterpriseRouteErrorBoundaryState = {
  error: Error | null;
};

export default class EnterpriseRouteErrorBoundary extends React.Component<
  EnterpriseRouteErrorBoundaryProps,
  EnterpriseRouteErrorBoundaryState
> {
  state: EnterpriseRouteErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): EnterpriseRouteErrorBoundaryState {
    return { error };
  }

  private handleReset = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (error) {
      return <EnterpriseRouteErrorFallback error={error} reset={this.handleReset} />;
    }
    return this.props.children;
  }
}
