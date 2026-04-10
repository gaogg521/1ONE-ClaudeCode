/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ConfigStorage,
  type IConfigStorageRefer,
  type IMcpServer,
  BUILTIN_IMAGE_GEN_ID,
} from '@/common/config/storage';
import type { SpeechToTextConfig, SpeechToTextProvider } from '@/common/types/speech';
import { Divider, Form, Message, Button, Modal, Switch, Input } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useConfigModelListWithImage from '@/renderer/hooks/agent/useConfigModelListWithImage';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import AionSelect from '@/renderer/components/base/AionSelect';
import AddMcpServerModal from '@/renderer/pages/settings/components/AddMcpServerModal';
import McpAgentStatusDisplay from '@/renderer/pages/settings/ToolsSettings/McpAgentStatusDisplay';
import McpServerItem from '@/renderer/pages/settings/ToolsSettings/McpServerItem';
import {
  useMcpServers,
  useMcpAgentStatus,
  useMcpOperations,
  useMcpConnection,
  useMcpModal,
  useMcpServerCRUD,
  useMcpOAuth,
} from '@/renderer/hooks/mcp';
import classNames from 'classnames';
import { useSettingsViewMode } from '../settingsViewContext';

type MessageInstance = ReturnType<typeof Message.useMessage>[0];

const isBuiltinImageGenServer = (server: IMcpServer) => server.builtin === true && server.id === BUILTIN_IMAGE_GEN_ID;
const SPEECH_TO_TEXT_CONFIG_CHANGED_EVENT = '1one-claudecode:speech-to-text-config-changed';
const DEFAULT_SPEECH_TO_TEXT_CONFIG: SpeechToTextConfig = {
  enabled: false,
  provider: 'openai',
  openai: {
    apiKey: '',
    baseUrl: '',
    language: '',
    model: 'whisper-1',
  },
  deepgram: {
    apiKey: '',
    baseUrl: '',
    detectLanguage: true,
    language: '',
    model: 'nova-2',
    punctuate: true,
    smartFormat: true,
  },
  custom: {
    providerName: '',
    apiKey: '',
    baseUrl: '',
    model: '',
    language: '',
  },
};

const normalizeSpeechToTextConfig = (config?: SpeechToTextConfig): SpeechToTextConfig => ({
  ...DEFAULT_SPEECH_TO_TEXT_CONFIG,
  ...config,
  openai: {
    ...DEFAULT_SPEECH_TO_TEXT_CONFIG.openai,
    ...config?.openai,
  },
  deepgram: {
    ...DEFAULT_SPEECH_TO_TEXT_CONFIG.deepgram,
    ...config?.deepgram,
  },
  custom: {
    ...DEFAULT_SPEECH_TO_TEXT_CONFIG.custom,
    ...config?.custom,
  },
});

// ─── Image Generation Presets ─────────────────────────────────────────────────

type ImageGenPreset = {
  id: string;
  label: string;
  baseUrl: string;
  defaultModel: string;
};

const IMAGE_GEN_PRESETS: ImageGenPreset[] = [
  { id: 'dall-e-3', label: 'DALL-E 3 (OpenAI)', baseUrl: 'https://api.openai.com/v1', defaultModel: 'dall-e-3' },
  { id: 'dall-e-2', label: 'DALL-E 2 (OpenAI)', baseUrl: 'https://api.openai.com/v1', defaultModel: 'dall-e-2' },
  { id: 'stability', label: 'Stability AI', baseUrl: 'https://api.stability.ai/v2beta', defaultModel: 'stable-image/generate/ultra' },
  { id: 'gemini-image', label: 'Google Gemini Image', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', defaultModel: 'gemini-2.5-flash-image-preview' },
  { id: 'doubao', label: '豆包 (Doubao)', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', defaultModel: 'doubao-seedream-3-0' },
  { id: 'custom', label: '自定义 (Custom)', baseUrl: '', defaultModel: '' },
];

function detectPreset(baseUrl?: string, model?: string): string {
  if (!baseUrl && !model) return 'custom';
  for (const p of IMAGE_GEN_PRESETS) {
    if (p.id === 'custom') continue;
    if (p.baseUrl && baseUrl?.startsWith(p.baseUrl) && model === p.defaultModel) return p.id;
  }
  return 'custom';
}

const ImageGenerationSettingsSection: React.FC<{
  imageGenerationModel?: IConfigStorageRefer['tools.imageGenerationModel'];
  builtinImageGenServer?: IMcpServer;
  agentInstallStatus: Record<string, string[]>;
  isServerLoading: (name: string) => boolean;
  isUpdating: boolean;
  onModelChange: (value: Partial<IConfigStorageRefer['tools.imageGenerationModel']>) => void;
  onToggle: (checked: boolean) => Promise<void>;
}> = ({ imageGenerationModel, builtinImageGenServer, agentInstallStatus, isServerLoading, isUpdating, onModelChange, onToggle }) => {
  const { t } = useTranslation();

  const initPreset = detectPreset(imageGenerationModel?.baseUrl, imageGenerationModel?.useModel);
  const [selectedPresetId, setSelectedPresetId] = React.useState<string>(initPreset);
  const [apiKey, setApiKey] = React.useState<string>(imageGenerationModel?.apiKey ?? '');
  const [baseUrl, setBaseUrl] = React.useState<string>(imageGenerationModel?.baseUrl ?? '');
  const [model, setModel] = React.useState<string>(imageGenerationModel?.useModel ?? '');

  // Keep local form state in sync when the stored model config loads asynchronously.
  useEffect(() => {
    setSelectedPresetId(detectPreset(imageGenerationModel?.baseUrl, imageGenerationModel?.useModel));
    setApiKey(imageGenerationModel?.apiKey ?? '');
    setBaseUrl(imageGenerationModel?.baseUrl ?? '');
    setModel(imageGenerationModel?.useModel ?? '');
  }, [imageGenerationModel?.apiKey, imageGenerationModel?.baseUrl, imageGenerationModel?.useModel]);

  const renderLabel = useCallback(
    (label: string, requirement: 'required' | 'optional') => (
      <span className='inline-flex items-center gap-6px'>
        <span>{label}</span>
        <span aria-hidden='true' className='text-12px text-t-tertiary'>
          ({requirement === 'required' ? t('settings.fieldRequired') : t('settings.fieldOptional')})
        </span>
      </span>
    ),
    [t]
  );

  const handlePresetChange = useCallback(
    (presetId: string) => {
      const preset = IMAGE_GEN_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
      setSelectedPresetId(presetId);
      const newBaseUrl = preset.baseUrl;
      const newModel = preset.defaultModel;
      setBaseUrl(newBaseUrl);
      setModel(newModel);
      onModelChange({ baseUrl: newBaseUrl, useModel: newModel });
    },
    [onModelChange]
  );

  const handleApiKeyChange = useCallback(
    (value: string) => {
      setApiKey(value);
      onModelChange({ apiKey: value });
    },
    [onModelChange]
  );

  const handleBaseUrlChange = useCallback(
    (value: string) => {
      setBaseUrl(value);
      onModelChange({ baseUrl: value });
    },
    [onModelChange]
  );

  const handleModelChange = useCallback(
    (value: string) => {
      setModel(value);
      onModelChange({ useModel: value });
    },
    [onModelChange]
  );

  const imageGenerationInstalledAgents = builtinImageGenServer?.name
    ? (agentInstallStatus[builtinImageGenServer.name] ?? [])
    : [];

  return (
    <div className='px-[12px] md:px-[32px] py-[24px] bg-2 rd-12px md:rd-16px border border-border-2'>
      <div className='flex items-center justify-between mb-16px'>
        <div className='flex flex-col gap-4px'>
          <span className='text-14px text-t-primary'>{t('settings.imageGeneration')}</span>
          <span className='text-13px text-t-secondary'>{'配置 AI 图像生成服务，支持 DALL-E、Stability AI 等提供商。'}</span>
        </div>
        <div className='flex items-center gap-8px'>
          {builtinImageGenServer?.enabled && builtinImageGenServer.name && (
            <McpAgentStatusDisplay
              serverName={builtinImageGenServer.name}
              agentInstallStatus={agentInstallStatus}
              isLoadingAgentStatus={isServerLoading(builtinImageGenServer.name) && imageGenerationInstalledAgents.length === 0}
              alwaysVisible
            />
          )}
          <Switch
            disabled={isUpdating || !builtinImageGenServer}
            checked={Boolean(builtinImageGenServer?.enabled)}
            onChange={onToggle}
          />
        </div>
      </div>

      <Divider className='mt-0px mb-20px' />

      <Form layout='horizontal' labelAlign='left' className='space-y-12px'>
        <Form.Item label={'提供商 / 预设'}>
          <AionSelect value={selectedPresetId} onChange={handlePresetChange}>
            {IMAGE_GEN_PRESETS.map((p) => (
              <AionSelect.Option key={p.id} value={p.id}>{p.label}</AionSelect.Option>
            ))}
          </AionSelect>
        </Form.Item>

        <Form.Item label={renderLabel('API Key', 'required')}>
          <Input.Password
            value={apiKey}
            visibilityToggle
            placeholder={selectedPresetId === 'gemini-image' ? 'Google API Key' : 'sk-...'}
            onChange={handleApiKeyChange}
          />
        </Form.Item>

        <Form.Item label={renderLabel('Base URL', 'optional')}>
          <Input
            value={baseUrl}
            placeholder='https://api.openai.com/v1'
            onChange={handleBaseUrlChange}
          />
        </Form.Item>

        <Form.Item label={renderLabel('模型', 'optional')}>
          <Input
            value={model}
            placeholder={IMAGE_GEN_PRESETS.find(p => p.id === selectedPresetId)?.defaultModel ?? 'dall-e-3'}
            onChange={handleModelChange}
          />
        </Form.Item>

        {/* LiteLLM hint — shown for custom preset */}
        {selectedPresetId === 'custom' && (
          <div className='mt-4px p-12px rd-8px bg-[rgba(var(--primary-6),0.06)] border border-[rgba(var(--primary-6),0.15)] text-12px text-t-secondary space-y-6px'>
            <div className='font-medium text-t-primary mb-2px'>💡 使用 LiteLLM 代理时的填写格式</div>
            <div className='font-mono bg-[rgba(0,0,0,0.04)] rd-4px p-8px space-y-2px'>
              <div><span className='text-t-tertiary'>Base URL: </span>https://your-litellm.com</div>
              <div><span className='text-t-tertiary'>API Key:  </span>sk-your-litellm-key</div>
              <div><span className='text-t-tertiary'>模型:     </span>dall-e-3</div>
            </div>
            <div className='text-11px'>
              {'模型名填写 LiteLLM 中配置的图像模型别名即可，例如 '}
              <code className='bg-[rgba(0,0,0,0.05)] px-4px rd-3px'>dall-e-3</code>
              {'、'}
              <code className='bg-[rgba(0,0,0,0.05)] px-4px rd-3px'>flux-dev</code>
              {'。如 LiteLLM 使用 provider/model 格式，则填完整名称，例如 '}
              <code className='bg-[rgba(0,0,0,0.05)] px-4px rd-3px'>gemini/gemini-3.1-pro-preview</code>
              {'。'}
            </div>
          </div>
        )}
      </Form>
    </div>
  );
};

const SpeechToTextSettingsSection: React.FC<{
  config: SpeechToTextConfig;
  onChange: (updater: (current: SpeechToTextConfig) => SpeechToTextConfig) => void;
}> = ({ config, onChange }) => {
  const { t } = useTranslation();
  const renderSpeechToTextFieldLabel = useCallback(
    (labelKey: string, requirement: 'required' | 'optional') => (
      <span className='inline-flex items-center gap-6px'>
        <span>{t(labelKey)}</span>
        <span aria-hidden='true' className='text-12px text-t-tertiary'>
          ({t(requirement === 'required' ? 'settings.speechToTextRequired' : 'settings.speechToTextOptional')})
        </span>
      </span>
    ),
    [t]
  );

  const handleProviderChange = useCallback(
    (value: string) => {
      onChange((current) => ({
        ...current,
        provider: value as SpeechToTextProvider,
      }));
    },
    [onChange]
  );

  const handleOpenAIChange = useCallback(
    (field: keyof NonNullable<SpeechToTextConfig['openai']>, value: string) => {
      onChange((current) => ({
        ...current,
        openai: {
          ...current.openai,
          [field]: value,
        },
      }));
    },
    [onChange]
  );

  const handleDeepgramChange = useCallback(
    (field: keyof NonNullable<SpeechToTextConfig['deepgram']>, value: string | boolean) => {
      onChange((current) => ({
        ...current,
        deepgram: {
          ...current.deepgram,
          [field]: value,
        },
      }));
    },
    [onChange]
  );

  const handleCustomChange = useCallback(
    (field: keyof NonNullable<SpeechToTextConfig['custom']>, value: string) => {
      onChange((current) => ({
        ...current,
        custom: {
          ...current.custom,
          [field]: value,
        },
      }));
    },
    [onChange]
  );

  return (
    <div className='px-[12px] md:px-[32px] py-[24px] bg-2 rd-12px md:rd-16px border border-border-2'>
      <div className='flex items-center justify-between gap-12px mb-8px'>
        <div className='flex flex-col gap-4px'>
          <span className='text-14px text-t-primary'>{t('settings.speechToText')}</span>
          <span className='text-13px text-t-secondary'>{t('settings.speechToTextDescription')}</span>
        </div>
        <Switch
          checked={config.enabled}
          onChange={(checked) => {
            onChange((current) => ({
              ...current,
              enabled: checked,
            }));
          }}
        />
      </div>

      <Divider className='mt-0px mb-20px' />

      <Form layout='horizontal' labelAlign='left' className='space-y-12px'>
        <Form.Item label={t('settings.speechToTextProvider')}>
          <AionSelect value={config.provider} onChange={handleProviderChange}>
            <AionSelect.Option value='openai'>{t('settings.speechToTextProviderOpenAI')}</AionSelect.Option>
            <AionSelect.Option value='deepgram'>{t('settings.speechToTextProviderDeepgram')}</AionSelect.Option>
            <AionSelect.Option value='custom'>{'自定义 (OpenAI 兼容)'}</AionSelect.Option>
          </AionSelect>
        </Form.Item>

        {config.provider === 'openai' && (
          <>
            <Form.Item label={renderSpeechToTextFieldLabel('settings.speechToTextApiKey', 'required')}>
              <Input.Password
                value={config.openai?.apiKey}
                visibilityToggle
                onChange={(value) => handleOpenAIChange('apiKey', value)}
              />
            </Form.Item>
            <Form.Item label={renderSpeechToTextFieldLabel('settings.speechToTextBaseUrl', 'optional')}>
              <Input value={config.openai?.baseUrl} onChange={(value) => handleOpenAIChange('baseUrl', value)} />
            </Form.Item>
            <Form.Item label={renderSpeechToTextFieldLabel('settings.speechToTextModel', 'optional')}>
              <Input value={config.openai?.model} onChange={(value) => handleOpenAIChange('model', value)} />
            </Form.Item>
            <Form.Item label={renderSpeechToTextFieldLabel('settings.speechToTextLanguage', 'optional')}>
              <Input value={config.openai?.language} onChange={(value) => handleOpenAIChange('language', value)} />
            </Form.Item>
          </>
        )}
        {config.provider === 'deepgram' && (
          <>
            <Form.Item label={renderSpeechToTextFieldLabel('settings.speechToTextApiKey', 'required')}>
              <Input.Password
                value={config.deepgram?.apiKey}
                visibilityToggle
                onChange={(value) => handleDeepgramChange('apiKey', value)}
              />
            </Form.Item>
            <Form.Item label={renderSpeechToTextFieldLabel('settings.speechToTextBaseUrl', 'optional')}>
              <Input value={config.deepgram?.baseUrl} onChange={(value) => handleDeepgramChange('baseUrl', value)} />
            </Form.Item>
            <Form.Item label={renderSpeechToTextFieldLabel('settings.speechToTextModel', 'optional')}>
              <Input value={config.deepgram?.model} onChange={(value) => handleDeepgramChange('model', value)} />
            </Form.Item>
            <Form.Item label={renderSpeechToTextFieldLabel('settings.speechToTextLanguage', 'optional')}>
              <Input value={config.deepgram?.language} onChange={(value) => handleDeepgramChange('language', value)} />
            </Form.Item>
            <Form.Item label={renderSpeechToTextFieldLabel('settings.speechToTextDetectLanguage', 'optional')}>
              <Switch
                checked={config.deepgram?.detectLanguage !== false}
                onChange={(checked) => handleDeepgramChange('detectLanguage', checked)}
              />
            </Form.Item>
            <Form.Item label={renderSpeechToTextFieldLabel('settings.speechToTextPunctuate', 'optional')}>
              <Switch
                checked={config.deepgram?.punctuate !== false}
                onChange={(checked) => handleDeepgramChange('punctuate', checked)}
              />
            </Form.Item>
            <Form.Item label={renderSpeechToTextFieldLabel('settings.speechToTextSmartFormat', 'optional')}>
              <Switch
                checked={config.deepgram?.smartFormat !== false}
                onChange={(checked) => handleDeepgramChange('smartFormat', checked)}
              />
            </Form.Item>
          </>
        )}
        {config.provider === 'custom' && (
          <>
            <Form.Item label={renderSpeechToTextFieldLabel('提供商名称', 'optional')}>
              <Input
                placeholder='例如: Azure STT, Whisper API'
                value={config.custom?.providerName}
                onChange={(value) => handleCustomChange('providerName', value)}
              />
            </Form.Item>
            <Form.Item label={renderSpeechToTextFieldLabel('settings.speechToTextApiKey', 'required')}>
              <Input.Password
                value={config.custom?.apiKey}
                visibilityToggle
                onChange={(value) => handleCustomChange('apiKey', value)}
              />
            </Form.Item>
            <Form.Item label={renderSpeechToTextFieldLabel('settings.speechToTextBaseUrl', 'required')}>
              <Input
                placeholder='例如: https://api.example.com/v1'
                value={config.custom?.baseUrl}
                onChange={(value) => handleCustomChange('baseUrl', value)}
              />
            </Form.Item>
            <Form.Item label={renderSpeechToTextFieldLabel('settings.speechToTextModel', 'optional')}>
              <Input
                placeholder='例如: whisper-1'
                value={config.custom?.model}
                onChange={(value) => handleCustomChange('model', value)}
              />
            </Form.Item>
            <Form.Item label={renderSpeechToTextFieldLabel('settings.speechToTextLanguage', 'optional')}>
              <Input value={config.custom?.language} onChange={(value) => handleCustomChange('language', value)} />
            </Form.Item>
            <div className='p-12px rd-8px bg-[rgba(var(--primary-6),0.06)] border border-[rgba(var(--primary-6),0.15)] text-12px text-t-secondary space-y-6px'>
              <div className='font-medium text-t-primary mb-2px'>💡 使用 LiteLLM 代理时的填写格式</div>
              <div className='font-mono bg-[rgba(0,0,0,0.04)] rd-4px p-8px space-y-2px'>
                <div><span className='text-t-tertiary'>Base URL: </span>https://your-litellm.com/v1</div>
                <div><span className='text-t-tertiary'>API Key:  </span>sk-your-litellm-key</div>
                <div><span className='text-t-tertiary'>模型:     </span>whisper-1</div>
              </div>
              <div className='text-11px'>
                {'LiteLLM 代理语音转文字走 '}
                <code className='bg-[rgba(0,0,0,0.05)] px-4px rd-3px'>/v1/audio/transcriptions</code>
                {'，Base URL 末尾加 '}
                <code className='bg-[rgba(0,0,0,0.05)] px-4px rd-3px'>/v1</code>
                {'，模型填 LiteLLM 中配置的别名即可。'}
              </div>
            </div>
</>
        )}
      </Form>
    </div>
  );
};

const ModalMcpManagementSection: React.FC<{
  message: MessageInstance;
  mcpServers: IMcpServer[];
  extensionMcpServers: IMcpServer[];
  saveMcpServers: (serversOrUpdater: IMcpServer[] | ((prev: IMcpServer[]) => IMcpServer[])) => Promise<void>;
  isPageMode?: boolean;
}> = ({ message, mcpServers, extensionMcpServers, saveMcpServers, isPageMode }) => {
  const { t } = useTranslation();
  const { agentInstallStatus, setAgentInstallStatus, isServerLoading, checkSingleServerInstallStatus } =
    useMcpAgentStatus();
  const { syncMcpToAgents, removeMcpFromAgents } = useMcpOperations(mcpServers, message);
  const { oauthStatus, loggingIn, checkOAuthStatus, login } = useMcpOAuth();
  const visibleMcpServers = useMemo(
    () => mcpServers.filter((server) => !isBuiltinImageGenServer(server)),
    [mcpServers]
  );

  const handleAuthRequired = useCallback(
    (server: IMcpServer) => {
      void checkOAuthStatus(server);
    },
    [checkOAuthStatus]
  );

  const { testingServers, handleTestMcpConnection } = useMcpConnection(
    mcpServers,
    saveMcpServers,
    message,
    handleAuthRequired
  );
  const {
    showMcpModal,
    editingMcpServer,
    deleteConfirmVisible,
    serverToDelete,
    mcpCollapseKey,
    showAddMcpModal,
    showEditMcpModal,
    hideMcpModal,
    showDeleteConfirm,
    hideDeleteConfirm,
    toggleServerCollapse,
  } = useMcpModal();
  const {
    handleAddMcpServer,
    handleBatchImportMcpServers,
    handleEditMcpServer,
    handleDeleteMcpServer,
    handleToggleMcpServer,
  } = useMcpServerCRUD(
    mcpServers,
    saveMcpServers,
    syncMcpToAgents,
    removeMcpFromAgents,
    checkSingleServerInstallStatus,
    setAgentInstallStatus
  );

  const handleOAuthLogin = useCallback(
    async (server: IMcpServer) => {
      const result = await login(server);

      if (result.success) {
        message.success(`${server.name}: ${t('settings.mcpOAuthLoginSuccess') || 'Login successful'}`);
        void handleTestMcpConnection(server);
      } else {
        message.error(`${server.name}: ${result.error || t('settings.mcpOAuthLoginFailed') || 'Login failed'}`);
      }
    },
    [login, message, t, handleTestMcpConnection]
  );

  const wrappedHandleAddMcpServer = useCallback(
    async (serverData: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>) => {
      const addedServer = await handleAddMcpServer(serverData);
      if (addedServer) {
        void handleTestMcpConnection(addedServer);
        if (addedServer.transport.type === 'http' || addedServer.transport.type === 'sse') {
          void checkOAuthStatus(addedServer);
        }
        if (serverData.enabled) {
          void syncMcpToAgents(addedServer, true);
        }
      }
    },
    [handleAddMcpServer, handleTestMcpConnection, checkOAuthStatus, syncMcpToAgents]
  );

  const wrappedHandleEditMcpServer = useCallback(
    async (serverToEdit: IMcpServer | undefined, serverData: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>) => {
      const updatedServer = await handleEditMcpServer(serverToEdit, serverData);
      if (updatedServer) {
        void handleTestMcpConnection(updatedServer);
        if (updatedServer.transport.type === 'http' || updatedServer.transport.type === 'sse') {
          void checkOAuthStatus(updatedServer);
        }
        if (serverData.enabled) {
          void syncMcpToAgents(updatedServer, true);
        }
      }
    },
    [handleEditMcpServer, handleTestMcpConnection, checkOAuthStatus, syncMcpToAgents]
  );

  const wrappedHandleBatchImportMcpServers = useCallback(
    async (serversData: Omit<IMcpServer, 'id' | 'createdAt' | 'updatedAt'>[]) => {
      const addedServers = await handleBatchImportMcpServers(serversData);
      if (addedServers && addedServers.length > 0) {
        addedServers.forEach((server) => {
          void handleTestMcpConnection(server);
          if (server.transport.type === 'http' || server.transport.type === 'sse') {
            void checkOAuthStatus(server);
          }
          if (server.enabled) {
            void syncMcpToAgents(server, true);
          }
        });
      }
    },
    [handleBatchImportMcpServers, handleTestMcpConnection, checkOAuthStatus, syncMcpToAgents]
  );

  const [importMode, setImportMode] = useState<'json' | 'oneclick'>('json');

  useEffect(() => {
    const httpServers = mcpServers.filter((s) => s.transport.type === 'http' || s.transport.type === 'sse');
    if (httpServers.length > 0) {
      httpServers.forEach((server) => {
        void checkOAuthStatus(server);
      });
    }
  }, [mcpServers, checkOAuthStatus]);

  const handleConfirmDelete = useCallback(async () => {
    if (!serverToDelete) return;
    hideDeleteConfirm();
    await handleDeleteMcpServer(serverToDelete);
  }, [serverToDelete, hideDeleteConfirm, handleDeleteMcpServer]);

  const renderAddButton = () => (
    <Button
      type='primary'
      size='small'
      icon={<Plus size='14' />}
      shape='round'
      onClick={() => {
        setImportMode('json');
        showAddMcpModal();
      }}
    >
      {t('settings.mcpAddServer')}
    </Button>
  );

  return (
    <div className='flex flex-col gap-16px min-h-0'>
      <div className='flex gap-8px items-center justify-between'>
        <div className='text-14px text-t-primary'>{t('settings.mcpSettings')}</div>
        <div>{renderAddButton()}</div>
      </div>

      <div className='flex-1 min-h-0'>
        {visibleMcpServers.length === 0 && extensionMcpServers.length === 0 ? (
          <div className='py-24px text-center text-t-secondary text-14px border border-dashed border-border-2 rd-12px'>
            {t('settings.mcpNoServersFound')}
          </div>
        ) : (
          <AionScrollArea
            className={classNames('max-h-360px', isPageMode && 'max-h-none')}
            disableOverflow={isPageMode}
          >
            <div className='space-y-12px'>
              {visibleMcpServers.map((server) => (
                <McpServerItem
                  key={server.id}
                  server={server}
                  isCollapsed={mcpCollapseKey[server.id] || false}
                  agentInstallStatus={agentInstallStatus}
                  isServerLoading={isServerLoading}
                  isTestingConnection={testingServers[server.id] || false}
                  oauthStatus={oauthStatus[server.id]}
                  isLoggingIn={loggingIn[server.id]}
                  onToggleCollapse={() => toggleServerCollapse(server.id)}
                  onTestConnection={handleTestMcpConnection}
                  onEditServer={showEditMcpModal}
                  onDeleteServer={showDeleteConfirm}
                  onToggleServer={handleToggleMcpServer}
                  onOAuthLogin={handleOAuthLogin}
                />
              ))}
              {extensionMcpServers.map((server) => (
                <McpServerItem
                  key={server.id}
                  server={server}
                  isCollapsed={mcpCollapseKey[server.id] || false}
                  agentInstallStatus={agentInstallStatus}
                  isServerLoading={isServerLoading}
                  isTestingConnection={false}
                  onToggleCollapse={() => toggleServerCollapse(server.id)}
                  onTestConnection={handleTestMcpConnection}
                  onEditServer={() => {}}
                  onDeleteServer={() => {}}
                  onToggleServer={() => Promise.resolve()}
                  isReadOnly
                />
              ))}
            </div>
          </AionScrollArea>
        )}
      </div>

      <AddMcpServerModal
        visible={showMcpModal}
        server={editingMcpServer}
        onCancel={hideMcpModal}
        onSubmit={
          editingMcpServer
            ? (serverData) => wrappedHandleEditMcpServer(editingMcpServer, serverData)
            : wrappedHandleAddMcpServer
        }
        onBatchImport={wrappedHandleBatchImportMcpServers}
        importMode={importMode}
      />

      <Modal
        title={t('settings.mcpDeleteServer')}
        visible={deleteConfirmVisible}
        onCancel={hideDeleteConfirm}
        onOk={handleConfirmDelete}
        okButtonProps={{ status: 'danger' }}
        okText={t('common.confirm')}
        cancelText={t('common.cancel')}
      >
        <p>{t('settings.mcpDeleteConfirm')}</p>
      </Modal>
    </div>
  );
};

const ToolsModalContent: React.FC = () => {
  const { t } = useTranslation();
  const [mcpMessage, mcpMessageContext] = Message.useMessage({ maxCount: 10 });
  const [imageGenerationModel, setImageGenerationModel] = useState<
    IConfigStorageRefer['tools.imageGenerationModel'] | undefined
  >();
  const [speechToTextConfig, setSpeechToTextConfig] = useState<SpeechToTextConfig>(DEFAULT_SPEECH_TO_TEXT_CONFIG);
  const [isUpdatingImageGeneration, setIsUpdatingImageGeneration] = useState(false);
  const { modelListWithImage: data } = useConfigModelListWithImage();
  const { mcpServers, extensionMcpServers, saveMcpServers } = useMcpServers();
  const { agentInstallStatus, setAgentInstallStatus, isServerLoading, checkSingleServerInstallStatus } =
    useMcpAgentStatus();
  const { syncMcpToAgents, removeMcpFromAgents } = useMcpOperations(mcpServers, mcpMessage);
  const builtinImageGenServer = useMemo(() => mcpServers.find(isBuiltinImageGenServer), [mcpServers]);
  const skipNextImageGenerationAutoCheckRef = useRef(false);

  useEffect(() => {
    const loadConfigs = async () => {
      try {
        const storedModel = await ConfigStorage.get('tools.imageGenerationModel');
        const storedSpeechToTextConfig = await ConfigStorage.get('tools.speechToText');
        if (storedModel) {
          setImageGenerationModel(storedModel);
        } else if (builtinImageGenServer?.transport.type === 'stdio') {
          // Fallback: derive config from the built-in MCP server env so the toggle is usable
          // even when tools.imageGenerationModel has not been initialized yet.
          const env = builtinImageGenServer.transport.env ?? {};
          const derived = {
            platform: env.ONE_IMG_PLATFORM,
            baseUrl: env.ONE_IMG_BASE_URL,
            apiKey: env.ONE_IMG_API_KEY,
            useModel: env.ONE_IMG_MODEL,
            switch: builtinImageGenServer.enabled,
          } as Partial<IConfigStorageRefer['tools.imageGenerationModel']>;
          if (derived.apiKey || derived.useModel || derived.baseUrl) {
            setImageGenerationModel(derived as IConfigStorageRefer['tools.imageGenerationModel']);
          }
        }
        setSpeechToTextConfig(normalizeSpeechToTextConfig(storedSpeechToTextConfig));
      } catch (error) {
        console.error('Failed to load tools config:', error);
      }
    };

    void loadConfigs();
  }, [builtinImageGenServer?.enabled, builtinImageGenServer?.transport.type]);

  const updateSpeechToTextConfig = useCallback((updater: (current: SpeechToTextConfig) => SpeechToTextConfig) => {
    setSpeechToTextConfig((current) => {
      const next = normalizeSpeechToTextConfig(updater(current));
      ConfigStorage.set('tools.speechToText', next).catch((error) => {
        console.error('Failed to save speech-to-text config:', error);
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(SPEECH_TO_TEXT_CONFIG_CHANGED_EVENT));
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!builtinImageGenServer?.name || !builtinImageGenServer.enabled) return;
    if (skipNextImageGenerationAutoCheckRef.current) {
      skipNextImageGenerationAutoCheckRef.current = false;
      return;
    }
    void checkSingleServerInstallStatus(builtinImageGenServer.name);
  }, [builtinImageGenServer?.enabled, builtinImageGenServer?.name, checkSingleServerInstallStatus]);

  const clearImageGenerationAgentStatus = useCallback(
    (serverName: string) => {
      const updated = { ...agentInstallStatus };
      delete updated[serverName];
      setAgentInstallStatus(updated);
      void ConfigStorage.set('mcp.agentInstallStatus', updated).catch((error) => {
        console.error('Failed to clear image generation agent install status:', error);
      });
    },
    [setAgentInstallStatus, agentInstallStatus]
  );

  // Sync image generation model config to the built-in MCP server's transport.env
  const syncMcpServerEnv = useCallback(
    async (model: Partial<IConfigStorageRefer['tools.imageGenerationModel']>) => {
      const builtinServer = mcpServers.find(isBuiltinImageGenServer);
      if (!builtinServer || builtinServer.transport.type !== 'stdio') return;

      const env: Record<string, string> = { ...builtinServer.transport.env };
      if (model.platform) {
        env.ONE_IMG_PLATFORM = model.platform;
      } else {
        delete env.ONE_IMG_PLATFORM;
      }
      if (model.baseUrl) {
        env.ONE_IMG_BASE_URL = model.baseUrl;
      } else {
        delete env.ONE_IMG_BASE_URL;
      }
      if (model.apiKey) {
        env.ONE_IMG_API_KEY = model.apiKey;
      } else {
        delete env.ONE_IMG_API_KEY;
      }
      if (model.useModel) {
        env.ONE_IMG_MODEL = model.useModel;
      } else {
        delete env.ONE_IMG_MODEL;
      }

      const updatedServer: IMcpServer = {
        ...builtinServer,
        transport: { ...builtinServer.transport, env },
        updatedAt: Date.now(),
      };

      const updatedServers = mcpServers.map((s) => (s.id === BUILTIN_IMAGE_GEN_ID ? updatedServer : s));
      await saveMcpServers(updatedServers);
      if (updatedServer.enabled) {
        await syncMcpToAgents(updatedServer, true);
      }
    },
    [mcpServers, saveMcpServers, syncMcpToAgents]
  );

  // Sync imageGenerationModel apiKey when provider apiKey changes
  useEffect(() => {
    if (!imageGenerationModel || !data) return;

    const currentProvider = data.find((p) => p.id === imageGenerationModel.id);

    if (currentProvider && currentProvider.apiKey !== imageGenerationModel.apiKey) {
      const updatedModel = {
        ...imageGenerationModel,
        apiKey: currentProvider.apiKey,
      };

      setImageGenerationModel(updatedModel);
      ConfigStorage.set('tools.imageGenerationModel', updatedModel).catch((error) => {
        console.error('Failed to save image generation model config:', error);
      });
      void syncMcpServerEnv(updatedModel);
    } else if (!currentProvider) {
      setImageGenerationModel(undefined);
      ConfigStorage.remove('tools.imageGenerationModel').catch((error) => {
        console.error('Failed to remove image generation model config:', error);
      });
      void syncMcpServerEnv({});
    }
  }, [data, imageGenerationModel?.id, imageGenerationModel?.apiKey, syncMcpServerEnv]);

  const handleImageGenerationModelChange = useCallback(
    (value: Partial<IConfigStorageRefer['tools.imageGenerationModel']>) => {
      setImageGenerationModel((prev) => {
        const newImageGenerationModel = { ...prev, ...value };
        ConfigStorage.set('tools.imageGenerationModel', newImageGenerationModel).catch((error) => {
          console.error('Failed to update image generation model config:', error);
        });
        // Sync env vars to the built-in MCP server
        void syncMcpServerEnv(newImageGenerationModel);
        return newImageGenerationModel;
      });
    },
    [syncMcpServerEnv]
  );

  const handleImageGenerationToggle = useCallback(
    async (checked: boolean) => {
      if (!builtinImageGenServer) return;
      if (checked && (!imageGenerationModel?.apiKey || !imageGenerationModel?.useModel)) {
        mcpMessage.error(t('settings.fillRequiredFields'));
        return;
      }

      const updatedServer: IMcpServer = {
        ...builtinImageGenServer,
        enabled: checked,
        updatedAt: Date.now(),
      };

      setIsUpdatingImageGeneration(true);
      skipNextImageGenerationAutoCheckRef.current = checked;
      try {
        await saveMcpServers((prevServers) =>
          prevServers.map((server) => (isBuiltinImageGenServer(server) ? updatedServer : server))
        );

        setImageGenerationModel((prev) => {
          if (!prev) return prev;
          const next = { ...prev, switch: checked };
          ConfigStorage.set('tools.imageGenerationModel', next).catch((error) => {
            console.error('Failed to sync image generation switch state:', error);
          });
          return next;
        });

        if (checked) {
          clearImageGenerationAgentStatus(updatedServer.name);
          await syncMcpToAgents(updatedServer, true);
          await checkSingleServerInstallStatus(updatedServer.name);
        } else {
          await removeMcpFromAgents(updatedServer.name, undefined, updatedServer.transport.type);
          clearImageGenerationAgentStatus(updatedServer.name);
        }
      } catch (error) {
        skipNextImageGenerationAutoCheckRef.current = false;
        console.error('Failed to toggle image generation MCP server:', error);
      } finally {
        if (!checked) {
          skipNextImageGenerationAutoCheckRef.current = false;
        }
        setIsUpdatingImageGeneration(false);
      }
    },
    [
      builtinImageGenServer,
      checkSingleServerInstallStatus,
      clearImageGenerationAgentStatus,
      imageGenerationModel?.apiKey,
      imageGenerationModel?.useModel,
      mcpMessage,
      removeMcpFromAgents,
      saveMcpServers,
      syncMcpToAgents,
      t,
    ]
  );

  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';

  return (
    <div className='flex flex-col h-full w-full'>
      {mcpMessageContext}

      {/* Content Area */}
      <AionScrollArea className='flex-1 min-h-0 pb-16px' disableOverflow={isPageMode}>
        <div className='space-y-16px'>
          {/* MCP 工具配置 */}
          <div className='px-[12px] md:px-[32px] py-[24px] bg-2 rd-12px md:rd-16px flex flex-col min-h-0 border border-border-2'>
            <div className='flex-1 min-h-0'>
              <AionScrollArea
                className={classNames('h-full', isPageMode && 'overflow-visible')}
                disableOverflow={isPageMode}
              >
                <ModalMcpManagementSection
                  message={mcpMessage}
                  mcpServers={mcpServers}
                  extensionMcpServers={extensionMcpServers}
                  saveMcpServers={saveMcpServers}
                  isPageMode={isPageMode}
                />
              </AionScrollArea>
            </div>
          </div>
          {/* 图像生成 */}
          <ImageGenerationSettingsSection
            imageGenerationModel={imageGenerationModel}
            builtinImageGenServer={builtinImageGenServer}
            agentInstallStatus={agentInstallStatus}
            isServerLoading={isServerLoading}
            isUpdating={isUpdatingImageGeneration}
            onModelChange={handleImageGenerationModelChange}
            onToggle={handleImageGenerationToggle}
          />
          <SpeechToTextSettingsSection config={speechToTextConfig} onChange={updateSpeechToTextConfig} />
        </div>
      </AionScrollArea>
    </div>
  );
};

export default ToolsModalContent;
