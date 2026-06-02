import { useCallback } from 'react';
import { Message } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';

export function useIssueEnterpriseGate() {
  const { t } = useTranslation();
  const auth = useAuth();
  const enterpriseMode = useWebuiEnterpriseMode();
  const isAuthenticated = auth.status === 'authenticated';

  const ensureEnterpriseLogin = useCallback(
    (purpose: 'create' | 'comment' | 'update' = 'create'): boolean => {
      if (isAuthenticated) {
        return true;
      }
      const messageKey =
        purpose === 'comment'
          ? 'common.issues.loginRequiredToComment'
          : purpose === 'update'
            ? 'common.issues.loginRequiredToUpdate'
            : 'common.issues.loginRequiredToCreate';
      Message.warning(
        t(messageKey, {
          defaultValue:
            purpose === 'comment'
              ? '请先登录企业账号后再发表评论。'
              : purpose === 'update'
                ? '请先登录企业账号后再修改 Issue。'
                : '请先登录企业账号后再创建 Issue。',
        })
      );
      void enterpriseMode.openEnterpriseLoginInBrowser();
      return false;
    },
    [enterpriseMode, isAuthenticated, t]
  );

  return { isAuthenticated, ensureEnterpriseLogin };
}
