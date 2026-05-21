/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Alert } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';

/** WebUI 设置页：个人版 / 企业版工作区 / 管理后台 三层说明 */
const WebuiEditionHelpPanel: React.FC = () => {
  const { t } = useTranslation();

  return (
    <Alert
      className='mb-12px'
      type='info'
      title={t('settings.webui.editionLayersTitle', { defaultValue: '三个入口，别混用' })}
      content={
        <ul className='m-0 pl-18px text-12px text-t-secondary leading-relaxed space-y-6px'>
          <li>
            {t('settings.webui.editionLayerPersonal', {
              defaultValue: '个人版：本机/个人身份，在标题栏切换后进入会话工作区。',
            })}
          </li>
          <li>
            {t('settings.webui.editionLayerEnterprise', {
              defaultValue:
                '企业版：同一套工作区界面，公司身份；侧栏「团队」仅企业版且加入后可用。切换企业版不会打开管理后台。',
            })}
          </li>
          <li>
            {t('settings.webui.editionLayerAdmin', {
              defaultValue: '管理后台：组织管理员配置成员、LDAP、邀请码、邮件；从侧栏进入，与版本切换无关。',
            })}
          </li>
        </ul>
      }
    />
  );
};

export default WebuiEditionHelpPanel;
