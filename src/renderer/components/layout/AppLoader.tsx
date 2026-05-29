import { Spin } from '@arco-design/web-react';
import React from 'react';

const AppLoader: React.FC = () => {
  return (
    <div
      className='flex items-center justify-center min-h-screen bg-[var(--bg-base,#f7f8fa)] text-[var(--text-primary,inherit)]'
      role='status'
      aria-live='polite'
      aria-busy='true'
    >
      <Spin dot />
    </div>
  );
};

export default AppLoader;
