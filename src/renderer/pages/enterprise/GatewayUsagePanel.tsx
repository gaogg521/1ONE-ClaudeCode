import React, { useState, useEffect, useCallback } from 'react';
import { Button, Input, Spin, Statistic, Table, Tag, Typography } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';

type ModelSpendRow = {
  model: string;
  total_tokens: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_cost: number;
  successful_requests?: number;
  failed_requests?: number;
};

const LS_URL = '1one_usage_gateway_url';
const LS_KEY = '1one_usage_gateway_key';

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const GatewayUsagePanel: React.FC = () => {
  const { t } = useTranslation();

  const [urlInput, setUrlInput] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [savedUrl, setSavedUrl] = useState(() => localStorage.getItem(LS_URL) ?? '');
  const [savedKey, setSavedKey] = useState(() => localStorage.getItem(LS_KEY) ?? '');
  const [editing, setEditing] = useState(!localStorage.getItem(LS_URL));

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ModelSpendRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const fetchData = useCallback(async (url: string, key: string) => {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      const end = new Date();
      const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
      const base = url.replace(/\/+$/, '');
      const res = await fetch(
        `${base}/global/spend/models?start_date=${formatDate(start)}&end_date=${formatDate(end)}`,
        { headers: { Authorization: `Bearer ${key}` }, signal: controller.signal }
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}${text ? ': ' + text.slice(0, 200) : ''}`);
      }
      const json = await res.json();
      const data: ModelSpendRow[] = Array.isArray(json) ? json : (json.data ?? []);
      setRows(data.sort((a, b) => b.total_tokens - a.total_tokens));
      setUpdatedAt(new Date());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(e instanceof Error && e.name === 'AbortError' ? t('admin.usage.gatewayTimeout', { defaultValue: '请求超时，请检查网关地址是否可访问' }) : msg);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (savedUrl && savedKey && !editing) {
      void fetchData(savedUrl, savedKey);
    }
  }, [savedUrl, savedKey, editing, fetchData]);

  const handleSave = () => {
    const url = urlInput.trim();
    const key = keyInput.trim();
    localStorage.setItem(LS_URL, url);
    localStorage.setItem(LS_KEY, key);
    setSavedUrl(url);
    setSavedKey(key);
    setEditing(false);
  };

  const handleEdit = () => {
    setUrlInput(savedUrl);
    setKeyInput(savedKey);
    setEditing(true);
  };

  const totalTokens = rows.reduce((s, r) => s + (r.total_tokens ?? 0), 0);
  const totalCost = rows.reduce((s, r) => s + (r.total_cost ?? 0), 0);

  if (editing) {
    return (
      <div style={{ maxWidth: 480 }}>
        <Typography.Text type='secondary' className='text-12px block mb-16px'>
          {t('admin.usage.gatewayHint', {
            defaultValue: '填入 LiteLLM 网关地址与 API Key，即可从网关读取真实使用统计。未配置则不显示此功能。',
          })}
        </Typography.Text>
        <div className='flex flex-col gap-12px'>
          <div>
            <div className='text-12px text-t-secondary mb-4px'>
              {t('admin.usage.gatewayUrl', { defaultValue: '网关地址' })}
            </div>
            <Input
              value={urlInput}
              onChange={setUrlInput}
              placeholder='https://litellm-internal.example.com'
              size='small'
            />
          </div>
          <div>
            <div className='text-12px text-t-secondary mb-4px'>
              {t('admin.usage.gatewayKey', { defaultValue: 'API Key' })}
            </div>
            <Input.Password value={keyInput} onChange={setKeyInput} placeholder='sk-...' size='small' />
          </div>
          <div className='flex gap-8px'>
            <Button type='primary' size='small' onClick={handleSave} disabled={!urlInput.trim() || !keyInput.trim()}>
              {t('admin.usage.gatewaySave', { defaultValue: '保存并查询' })}
            </Button>
            {savedUrl && (
              <Button size='small' onClick={() => setEditing(false)}>
                {t('common.cancel', { defaultValue: '取消' })}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Spin loading={loading}>
      <div>
        <div className='flex items-center justify-between mb-16px flex-wrap gap-8px'>
          <div className='flex gap-24px flex-wrap'>
            <Statistic
              title={t('admin.usage.gatewayTotalTokens', { defaultValue: '合计 Token（近 30 天）' })}
              value={totalTokens}
              groupSeparator
            />
            <Statistic
              title={t('admin.usage.gatewayTotalCost', { defaultValue: '合计费用（USD）' })}
              value={`$${totalCost.toFixed(4)}`}
            />
          </div>
          <div className='flex gap-8px items-center'>
            {updatedAt && (
              <Typography.Text type='secondary' className='text-11px'>
                {updatedAt.toLocaleTimeString('zh-CN')}
              </Typography.Text>
            )}
            <Button size='mini' onClick={() => void fetchData(savedUrl, savedKey)}>
              {t('common.refresh', { defaultValue: '刷新' })}
            </Button>
            <Button size='mini' type='secondary' onClick={handleEdit}>
              {t('common.settings', { defaultValue: '设置' })}
            </Button>
          </div>
        </div>

        {error && (
          <Typography.Text type='error' className='text-12px block mb-8px'>
            {error}
          </Typography.Text>
        )}

        <Table
          data={rows}
          rowKey='model'
          size='small'
          border={false}
          pagination={{ pageSize: 20, showTotal: true }}
          columns={[
            {
              title: t('admin.usage.gatewayColModel', { defaultValue: '模型' }),
              dataIndex: 'model',
              ellipsis: true,
            },
            {
              title: t('admin.usage.gatewayColTokens', { defaultValue: 'Token' }),
              dataIndex: 'total_tokens',
              sorter: (a: ModelSpendRow, b: ModelSpendRow) => a.total_tokens - b.total_tokens,
              render: (v: number) => (v ?? 0).toLocaleString(),
            },
            {
              title: t('admin.usage.gatewayColPct', { defaultValue: '占比' }),
              key: 'pct',
              render: (_: unknown, r: ModelSpendRow) => {
                if (!totalTokens) return '—';
                const pct = Math.round(((r.total_tokens ?? 0) / totalTokens) * 100);
                return (
                  <Tag size='small' color={pct >= 50 ? 'arcoblue' : pct >= 10 ? 'purple' : 'gray'}>
                    {pct}%
                  </Tag>
                );
              },
            },
            {
              title: t('admin.usage.gatewayColCost', { defaultValue: '费用 (USD)' }),
              dataIndex: 'total_cost',
              sorter: (a: ModelSpendRow, b: ModelSpendRow) => a.total_cost - b.total_cost,
              render: (v: number) => `$${(v ?? 0).toFixed(4)}`,
            },
            {
              title: t('admin.usage.gatewayColRequests', { defaultValue: '请求数' }),
              key: 'requests',
              render: (_: unknown, r: ModelSpendRow) => {
                const ok = r.successful_requests ?? 0;
                const fail = r.failed_requests ?? 0;
                const total = ok + fail;
                if (!total) return '—';
                return (
                  <span>
                    {total.toLocaleString()}
                    {fail > 0 && (
                      <Tag size='small' color='red' className='ml-4px'>
                        {Math.round((fail / total) * 100)}% 失败
                      </Tag>
                    )}
                  </span>
                );
              },
            },
          ]}
        />
      </div>
    </Spin>
  );
};

export default GatewayUsagePanel;
