import { useCallback } from 'react';
import { Message } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/renderer/hooks/context/AuthContext';
import { useWebuiEnterpriseMode } from '@/renderer/hooks/webui/useWebuiEnterpriseMode';
import { readCurrentHashPath } from '@/renderer/utils/enterpriseLoginNavigation';

export function useIssueEnterpriseGate() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
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
      const returnTo = `${location.pathname}${location.search}` || readCurrentHashPath();
      void enterpriseMode.startEnterpriseLogin((path) => navigate(path), returnTo);
      return false;
    },
    [enterpriseMode, isAuthenticated, location.pathname, location.search, navigate, t]
  );

  return { isAuthenticated, ensureEnterpriseLogin };
}
