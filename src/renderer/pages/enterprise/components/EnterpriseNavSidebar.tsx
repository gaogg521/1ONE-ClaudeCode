import React from 'react';
import { Menu, Tag, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { ENTERPRISE_NAV_ITEMS } from '@/renderer/pages/enterprise/enterpriseNav';
import styles from '@/renderer/pages/enterprise/EnterpriseLayout.module.css';

type NavItem = { key: string; labelKey: string; labelDefault: string; path: string; comingSoon?: boolean };

type EnterpriseNavSidebarProps = { tenantLabel: string; activeNavKey: string; onNavigate: (path: string) => void; };

const EnterpriseNavSidebar: React.FC<EnterpriseNavSidebarProps> = ({ tenantLabel, activeNavKey, onNavigate }) => {
  const { t } = useTranslation();
  return (
    <aside className={styles.sidebar} style={{ background: 'var(--ep-bg-sidebar)', borderRight: '1px solid var(--ep-border-sidebar)' }}>
      <div className='px-16px pt-16px pb-12px border-b' style={{ borderBottomColor: 'var(--ep-border-divider)' }}>
        <div className='text-15px font-700 mb-4px' style={{ color: 'var(--ep-text-primary)' }}>{t('settings.enterpriseConsole.title', { defaultValue: '企业控制台' })}</div>
        <Typography.Paragraph type='secondary' className='mb-0 text-12px truncate' style={{ color: 'var(--ep-text-secondary)' }}>{tenantLabel}</Typography.Paragraph>
      </div>
      <Menu className='flex-1 border-0 bg-transparent' selectedKeys={[activeNavKey]} onClickMenuItem={(key) => {
        const item = ENTERPRISE_NAV_ITEMS.find((n: NavItem) => n.key === key);
        if (item) onNavigate(item.path);
      }}>
        {ENTERPRISE_NAV_ITEMS.map((item: NavItem) => (
          <Menu.Item key={item.key} disabled={!!item.comingSoon}>
            <span className='flex items-center justify-between gap-8px'>
              {t(item.labelKey, { defaultValue: item.labelDefault })}
              {item.comingSoon && <Tag size='small' color='gray'>{t('settings.enterpriseConsole.navComingSoon', { defaultValue: '即将推出' })}</Tag>}
            </span>
          </Menu.Item>
        ))}
      </Menu>
    </aside>
  );
};
export default EnterpriseNavSidebar;
