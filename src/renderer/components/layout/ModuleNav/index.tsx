/**
 * ModuleNav — 1ONE ClaudeCode 左侧模块导航栏
 * 8个核心模块的图标导航，固定在最左侧
 */
import React from 'react';
import { Tooltip } from '@arco-design/web-react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  CommentOne,
  FolderOpen,
  Checklist,
  Server,
  Brain,
  Lightning,
  AlarmClock,
  Setting,
} from '@icon-park/react';

interface NavItem {
  icon: React.ReactNode;
  label: string;
  path: string;
  paths?: string[]; // 额外匹配路径
}

const NAV_ITEMS: NavItem[] = [
  {
    icon: <CommentOne theme='outline' size={20} />,
    label: '会话中心',
    path: '/sessions',
  },
  {
    icon: <FolderOpen theme='outline' size={20} />,
    label: '工作区',
    path: '/workspace',
    paths: ['/conversation'],
  },
  {
    icon: <Checklist theme='outline' size={20} />,
    label: '任务看板',
    path: '/tasks',
  },
  {
    icon: <Lightning theme='outline' size={20} />,
    label: 'Hook 监控',
    path: '/hooks',
  },
  {
    icon: <Server theme='outline' size={20} />,
    label: 'MCP 服务',
    path: '/mcp',
  },
  {
    icon: <Brain theme='outline' size={20} />,
    label: '记忆管理',
    path: '/memory',
  },
  {
    icon: <AlarmClock theme='outline' size={20} />,
    label: '定时任务',
    path: '/scheduled',
  },
];

const SETTINGS_ITEM: NavItem = {
  icon: <Setting theme='outline' size={20} />,
  label: '设置',
  path: '/settings',
};

const ModuleNav: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (item: NavItem) => {
    const allPaths = [item.path, ...(item.paths ?? [])];
    return allPaths.some((p) => location.pathname.startsWith(p));
  };

  const renderItem = (item: NavItem) => {
    const active = isActive(item);
    return (
      <Tooltip key={item.path} content={item.label} position='right' mini>
        <div
          onClick={() => navigate(item.path)}
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: active ? 'var(--color-primary-6)' : 'var(--color-text-3)',
            background: active ? 'rgba(var(--primary-6), 0.12)' : 'transparent',
            border: active ? '1px solid rgba(var(--primary-6), 0.24)' : '1px solid transparent',
            transition: 'all 0.18s',
            marginBottom: 4,
          }}
          onMouseEnter={(e) => {
            if (!active) {
              e.currentTarget.style.background = 'var(--color-fill-3)';
              e.currentTarget.style.color = 'var(--color-text-1)';
            }
          }}
          onMouseLeave={(e) => {
            if (!active) {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--color-text-3)';
            }
          }}
        >
          {item.icon}
        </div>
      </Tooltip>
    );
  };

  return (
    <div
      style={{
        width: 56,
        minWidth: 56,
        height: '100%',
        background: 'var(--color-bg-1)',
        borderRight: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 8,
        paddingBottom: 8,
        flexShrink: 0,
      }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 4 }}>
        {NAV_ITEMS.map(renderItem)}
      </div>
      {renderItem(SETTINGS_ITEM)}
    </div>
  );
};

export default ModuleNav;
