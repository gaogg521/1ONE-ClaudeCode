import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/config/storage';
import { resolveLocaleKey } from '@/common/utils';
import type { AcpBackendConfig } from '@/common/types/acpTypes';
import type { ExternalSkillSource, SkillMetadata } from '@/common/types/skillMetadata';
import { normalizeExtensionAssistants } from '@/renderer/pages/settings/AgentSettings/AssistantManagement/assistantUtils';
import type { AssistantListItem } from '@/renderer/pages/settings/AgentSettings/AssistantManagement/types';
import {
  Button,
  Checkbox,
  Message,
  Modal,
  Tooltip,
  Typography,
  Input,
  Dropdown,
  Menu,
  Tag,
  Select,
} from '@arco-design/web-react';
import { Delete, FolderOpen, Info, Search, Plus, Refresh } from '@icon-park/react';
import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import SettingsPageWrapper from './components/SettingsPageWrapper';

/** Agent filter: skills used by at least one user-created (non-preset) assistant */

const IMPORT_ALREADY_EXISTS_RE = /^Skill "([^"]+)" already exists$/;
const IMPORT_ALREADY_EXISTS_BUILTIN_RE = /^Skill "([^"]+)" already exists in builtin skills$/;

const parseImportAlreadyExistsMessage = (
  msg: string | undefined
): { kind: 'user' | 'builtin'; name: string } | null => {
  if (!msg) return null;
  const trimmed = msg.trim();
  const builtinMatch = IMPORT_ALREADY_EXISTS_BUILTIN_RE.exec(trimmed);
  if (builtinMatch?.[1]) {
    return { kind: 'builtin', name: builtinMatch[1] };
  }
  const userMatch = IMPORT_ALREADY_EXISTS_RE.exec(trimmed);
  if (userMatch?.[1]) {
    return { kind: 'user', name: userMatch[1] };
  }
  return null;
};

const getAvatarColorClass = (name: string) => {
  if (!name) return 'bg-[var(--primary)] text-[var(--color-white)]';
  const colors = [
    'bg-[var(--primary)] text-[var(--color-white)]',
    'bg-[var(--success)] text-[var(--color-white)]',
    'bg-[var(--brand)] text-[var(--color-white)]',
    'bg-[var(--info)] text-[var(--color-white)]',
    'bg-[var(--warning)] text-[var(--color-white)]',
    'bg-[var(--danger)] text-[var(--color-white)]',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

const SkillsHubSettings: React.FC = () => {
  const { t, i18n } = useTranslation();
  const localeKey = resolveLocaleKey(i18n.language);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [availableSkills, setAvailableSkills] = useState<SkillMetadata[]>([]);
  const [autoSkills, setAutoSkills] = useState<SkillMetadata[]>([]);
  const [assistants, setAssistants] = useState<AssistantListItem[]>([]);
  const [skillPaths, setSkillPaths] = useState<{ userSkillsDir: string; builtinSkillsDir: string } | null>(null);
  const [externalSources, setExternalSources] = useState<ExternalSkillSource[]>([]);
  const [activeSourceTab, setActiveSourceTab] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchExternalQuery, setSearchExternalQuery] = useState('');
  // Modal: configure skills for a specific assistant (by-assistant view)
  const [configAssistantVisible, setConfigAssistantVisible] = useState(false);
  const [configAssistantTarget, setConfigAssistantTarget] = useState<AssistantListItem | null>(null);
  const [configAssistantSkillIds, setConfigAssistantSkillIds] = useState<string[]>([]);
  const [configAssistantSaving, setConfigAssistantSaving] = useState(false);
  const [configAssistantSearch, setConfigAssistantSearch] = useState('');
  const [externalSkillFilter, setExternalSkillFilter] = useState<'all' | 'unimported' | 'imported' | 'conflict'>('all');
  const [agentFilter, setAgentFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [showAddPathModal, setShowAddPathModal] = useState(false);
  const [customPathName, setCustomPathName] = useState('');
  const [customPathValue, setCustomPathValue] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState<SkillMetadata | null>(null);
  const [selectedAssistantIds, setSelectedAssistantIds] = useState<string[]>([]);
  const [skillSortMode, setSkillSortMode] = useState<'usage-desc' | 'usage-asc' | 'name-asc' | 'name-desc'>(
    'usage-desc'
  );
  const [activeMainTab, setActiveMainTab] = useState<'library' | 'discover'>('library');
  const [skillView, setSkillView] = useState<'by-skill' | 'by-assistant'>('by-skill');
  const [replaceModalVisible, setReplaceModalVisible] = useState(false);
  const [replaceFromSkill, setReplaceFromSkill] = useState<string>('');
  const [replaceToSkill, setReplaceToSkill] = useState<string>('');
  const [replaceAssistantIds, setReplaceAssistantIds] = useState<string[]>([]);
  const [replaceSaving, setReplaceSaving] = useState(false);
  const [removeModalVisible, setRemoveModalVisible] = useState(false);
  const [removeTargetSkill, setRemoveTargetSkill] = useState<SkillMetadata | null>(null);
  const [removeAssistantIds, setRemoveAssistantIds] = useState<string[]>([]);
  const [removeSaving, setRemoveSaving] = useState(false);
  const [externalPreviewSkill, setExternalPreviewSkill] = useState<SkillMetadata | null>(null);
  const [mySkillPreview, setMySkillPreview] = useState<SkillMetadata | null>(null);

  const getAssistantDisplayName = useCallback(
    (assistant: AcpBackendConfig) => assistant.nameI18n?.[localeKey] || assistant.name,
    [localeKey]
  );

  const getAgentLabel = useCallback(
    (agentType?: string) => {
      switch (agentType) {
        case 'aionrs':
          return '1ONE';
        case 'gemini':
          return 'Gemini';
        case 'claude':
          return 'Claude';
        case 'codex':
          return 'Codex';
        case 'codebuddy':
          return 'CodeBuddy';
        case 'opencode':
          return 'OpenCode';
        case 'qwen':
          return 'Qwen';
        case 'kiro':
          return 'Kiro';
        default:
          return agentType || t('settings.skillsHub.unknownAgent', { defaultValue: 'Unknown Agent' });
      }
    },
    [t]
  );

  const renderSkillMetaTags = useCallback(
    (skill: SkillMetadata) => {
      if (!skill.effective && skill.shadowedBy) {
        return (
          <div className='flex flex-wrap items-center gap-6px'>
            <Tag size='small' color='orangered'>
              {t('settings.skillsHub.nameConflict', { defaultValue: '名称冲突' })}
            </Tag>
          </div>
        );
      }
      return null;
    },
    [t]
  );

  const skillUsageMap = useMemo(() => {
    return new Map(
      availableSkills.map((skill) => {
        const usedByAssistants = assistants.filter((assistant) => assistant.enabledSkills?.includes(skill.name));
        const agentTypes = Array.from(
          new Set(
            usedByAssistants
              .map((assistant) => assistant.presetAgentType)
              .filter((agentType): agentType is string => typeof agentType === 'string' && agentType.length > 0)
          )
        );

        return [
          skill.name,
          {
            usedByAssistants,
            agentTypes,
          },
        ];
      })
    );
  }, [assistants, availableSkills]);

  const filteredSkills = useMemo(() => {
    const lowerQuery = searchQuery.toLowerCase();
    return availableSkills.filter((skill) => {
      const matchesQuery =
        !searchQuery.trim() ||
        skill.name.toLowerCase().includes(lowerQuery) ||
        (skill.description && skill.description.toLowerCase().includes(lowerQuery)) ||
        (skill.location && skill.location.toLowerCase().includes(lowerQuery)) ||
        (skill.directory && skill.directory.toLowerCase().includes(lowerQuery)) ||
        (skill.runtimeFiles?.some((f) => f.toLowerCase().includes(lowerQuery)) ?? false);

      if (!matchesQuery) {
        return false;
      }

      const usage = skillUsageMap.get(skill.name);
      if (agentFilter === 'assigned') {
        return (usage?.usedByAssistants.length ?? 0) > 0;
      }
      if (agentFilter === 'unassigned') {
        return !usage || usage.usedByAssistants.length === 0;
      }
      return true;
    });
  }, [agentFilter, availableSkills, searchQuery, skillUsageMap]);

  const displaySkills = useMemo(() => {
    const cmpUsage = (a: SkillMetadata, b: SkillMetadata) => {
      const ua = skillUsageMap.get(a.name)?.usedByAssistants.length ?? 0;
      const ub = skillUsageMap.get(b.name)?.usedByAssistants.length ?? 0;
      return ua - ub;
    };
    const cmpName = (a: SkillMetadata, b: SkillMetadata) => a.name.localeCompare(b.name);
    return filteredSkills.toSorted((a, b) => {
      if (skillSortMode === 'usage-desc') {
        return cmpUsage(b, a) || cmpName(a, b);
      }
      if (skillSortMode === 'usage-asc') {
        return cmpUsage(a, b) || cmpName(a, b);
      }
      if (skillSortMode === 'name-desc') {
        return cmpName(b, a);
      }
      return cmpName(a, b);
    });
  }, [filteredSkills, skillSortMode, skillUsageMap]);

  const groupedByAssistantData = useMemo(() => {
    const searchLower = searchQuery.toLowerCase().trim();
    const matchesSearch = (skill: SkillMetadata) => {
      if (!searchLower) return true;
      return (
        skill.name.toLowerCase().includes(searchLower) ||
        (skill.description ? skill.description.toLowerCase().includes(searchLower) : false)
      );
    };

    const allSections = assistants
      .toSorted((a, b) =>
        getAssistantDisplayName(a).localeCompare(getAssistantDisplayName(b), undefined, { sensitivity: 'base' })
      )
      .map((assistant) => {
        const enabledNames = Array.isArray(assistant.enabledSkills) ? assistant.enabledSkills : [];
        // Only count/show skills that exist in availableSkills (auto-skills in _builtin are excluded)
        const resolvedSkills = enabledNames
          .map((name) => availableSkills.find((s) => s.name === name))
          .filter((s): s is SkillMetadata => s !== undefined);
        const filteredSkills = resolvedSkills.filter(matchesSearch);
        // Skills configured but not found in availableSkills (e.g., auto-skills or deleted skills)
        const missingCount = enabledNames.length - resolvedSkills.length;
        return { assistant, skills: filteredSkills, totalEnabledCount: resolvedSkills.length, missingCount };
      });

    const sections = allSections.filter((section) => {
      if (agentFilter === 'assigned') return section.totalEnabledCount > 0;
      if (agentFilter === 'unassigned') return section.totalEnabledCount === 0;
      return true;
    });

    const unassignedSkills = availableSkills.filter((skill) => {
      const usage = skillUsageMap.get(skill.name);
      if (!matchesSearch(skill)) return false;
      return !usage || usage.usedByAssistants.length === 0;
    });

    return { sections, unassignedSkills };
  }, [agentFilter, assistants, availableSkills, getAssistantDisplayName, searchQuery, skillUsageMap]);

  const skillSelectOptions = useMemo(
    () =>
      availableSkills.map((skill) => ({
        value: skill.name,
        label: skill.name,
      })),
    [availableSkills]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [skills, autoSkillsList, agentConfigs] = await Promise.all([
        ipcBridge.fs.listAvailableSkills.invoke(),
        ipcBridge.fs.listAutoSkills.invoke().catch(() => [] as SkillMetadata[]),
        ConfigStorage.get('acp.customAgents'),
      ]);
      setAvailableSkills(skills);
      setAutoSkills(autoSkillsList);
      const localAgents: AssistantListItem[] = ((agentConfigs || []) as AssistantListItem[]).filter(
        (assistant) => typeof assistant.id === 'string' && assistant.id.length > 0
      );
      const extRaw = await ipcBridge.extensions.getAssistants.invoke().catch(() => [] as Record<string, unknown>[]);
      const extAgents = normalizeExtensionAssistants(extRaw);
      const mergedAgents = [...localAgents];
      for (const ext of extAgents) {
        if (!mergedAgents.some((a) => a.id === ext.id)) {
          mergedAgents.push(ext);
        }
      }
      setAssistants(mergedAgents);

      const external = await ipcBridge.fs.detectAndCountExternalSkills.invoke();
      if (external.success && external.data) {
        setExternalSources(external.data);
        if (external.data.length > 0 && !activeSourceTab) {
          setActiveSourceTab(external.data[0].source);
        }
      }

      const paths = await ipcBridge.fs.getSkillPaths.invoke();
      setSkillPaths(paths);
    } catch (error) {
      console.error('Failed to fetch skills:', error);
      Message.error(t('settings.skillsHub.fetchError', { defaultValue: 'Failed to fetch skills' }));
    } finally {
      setLoading(false);
    }
  }, [t, activeSourceTab]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleImport = useCallback(
    async (
      skillPath: string,
      opts?: { skillName?: string; skipRefetch?: boolean; closePreview?: boolean }
    ): Promise<boolean> => {
      const skillNameHint = opts?.skillName;
      const shouldRefetch = !opts?.skipRefetch;
      const closePreview = opts?.closePreview !== false;
      try {
        const result = await ipcBridge.fs.importSkillWithSymlink.invoke({ skillPath });
        if (result.success) {
          Message.success(
            result.msg || t('settings.skillsHub.importSuccess', { defaultValue: 'Skill imported successfully' })
          );
          if (closePreview) {
            setExternalPreviewSkill(null);
          }
          if (shouldRefetch) {
            void fetchData();
          }
          return true;
        } else {
          const duplicate = parseImportAlreadyExistsMessage(result.msg);
          const displayName = duplicate?.name ?? skillNameHint ?? '';
          if (duplicate?.kind === 'user') {
            Message.warning({
              content: t('settings.skillsHub.importAlreadyExistsUser', {
                name: displayName,
                defaultValue: `技能「${displayName}」已在「我的技能」中存在，无需重复导入。`,
              }),
              duration: 9000,
            });
          } else if (duplicate?.kind === 'builtin') {
            Message.warning({
              content: t('settings.skillsHub.importAlreadyExistsBuiltin', {
                name: displayName,
                defaultValue: `技能「${displayName}」与内置技能同名，无法从外部目录覆盖导入。`,
              }),
              duration: 9000,
            });
          } else {
            Message.error(result.msg || t('settings.skillsHub.importFailed', { defaultValue: 'Failed to import skill' }));
          }
          return false;
        }
      } catch (error) {
        console.error('Failed to import skill:', error);
        Message.error(t('settings.skillsHub.importError', { defaultValue: 'Error importing skill' }));
        return false;
      }
    },
    [fetchData, t]
  );

  const externalSkillImportStatusMap = useMemo(() => {
    const map = new Map<string, 'user' | 'builtin'>();
    for (const skill of availableSkills) {
      const existing = map.get(skill.name);
      if (existing === 'builtin') continue;
      if (skill.isCustom) {
        map.set(skill.name, 'user');
      } else {
        map.set(skill.name, 'builtin');
      }
    }
    return map;
  }, [availableSkills]);

  const renderExternalSkillStatusTag = useCallback(
    (skill: SkillMetadata) => {
      const status = externalSkillImportStatusMap.get(skill.name);
      if (status === 'user') {
        return (
          <Tag size='small' color='green'>
            {t('settings.skillsHub.externalSkillAlreadyImported', {
              defaultValue: 'Already imported',
            })}
          </Tag>
        );
      }
      if (status === 'builtin') {
        return (
          <Tag size='small' color='orangered'>
            {t('settings.skillsHub.externalSkillNameConflict', {
              defaultValue: 'Name conflicts with built-in skill',
            })}
          </Tag>
        );
      }
      return null;
    },
    [externalSkillImportStatusMap, t]
  );

  const externalSkillDirectory = (skill: SkillMetadata) => skill.directory || skill.location || '';

  const handleOpenExternalSkillFolder = useCallback(async (skill: SkillMetadata) => {
    const dir = externalSkillDirectory(skill);
    if (!dir) return;
    try {
      await ipcBridge.shell.showItemInFolder.invoke(dir);
    } catch (error) {
      console.error('Failed to open skill folder:', error);
      Message.error(t('settings.skillsHub.openFolderFailed', { defaultValue: 'Could not open folder' }));
    }
  }, [t]);

  const handleImportAll = useCallback(
    async (skills: ExternalSkillSource['skills']) => {
      let successCount = 0;
      for (const skill of skills) {
        const dir = externalSkillDirectory(skill);
        if (!dir) continue;
        const ok = await handleImport(dir, { skillName: skill.name, skipRefetch: true, closePreview: false });
        if (ok) successCount += 1;
      }
      if (successCount > 0) {
        Message.success(
          t('settings.skillsHub.importAllSuccess', {
            count: successCount,
            defaultValue: `${successCount} skills imported`,
          })
        );
        void fetchData();
      }
    },
    [fetchData, handleImport, t]
  );

  const handleDelete = useCallback(
    async (skillName: string) => {
      try {
        const result = await ipcBridge.fs.deleteSkill.invoke({ skillName });
        if (result.success) {
          setMySkillPreview((current) => (current?.name === skillName ? null : current));
          Message.success(result.msg || t('settings.skillsHub.deleteSuccess', { defaultValue: 'Skill deleted' }));
          void fetchData();
        } else {
          Message.error(result.msg || t('settings.skillsHub.deleteFailed', { defaultValue: 'Failed to delete skill' }));
        }
      } catch (error) {
        console.error('Failed to delete skill:', error);
        Message.error(t('settings.skillsHub.deleteError', { defaultValue: 'Error deleting skill' }));
      }
    },
    [fetchData, t]
  );

  const runExportSkillToTarget = useCallback(
    async (skill: SkillMetadata, targetDir: string) => {
      const skillPath = skill.directory || skill.location;
      if (!skillPath) {
        Message.error(t('settings.skillsHub.exportFailed', { defaultValue: 'Failed to export skill' }));
        return;
      }
      const hide = Message.loading({
        content: t('common.processing', { defaultValue: 'Processing...' }),
        duration: 0,
      });
      try {
        const result = await Promise.race([
          ipcBridge.fs.exportSkillWithSymlink.invoke({
            skillPath,
            targetDir,
          }),
          new Promise<{ success: boolean; msg: string }>((_, reject) =>
            setTimeout(() => reject(new Error('Export timed out.')), 8000)
          ),
        ]);
        hide();
        if (result.success) {
          Message.success(t('settings.skillsHub.exportSuccess', { defaultValue: 'Skill exported successfully' }));
        } else {
          Message.error(result.msg || t('settings.skillsHub.exportFailed', { defaultValue: 'Failed to export skill' }));
        }
      } catch (error) {
        hide();
        console.error('[SkillsHub] Export error:', error);
        Message.error(error instanceof Error ? error.message : String(error));
      }
    },
    [t]
  );

  const handleManualImport = async () => {
    try {
      const result = await ipcBridge.dialog.showOpen.invoke({
        properties: ['openDirectory'],
      });
      if (result && result.length > 0) {
        await handleImport(result[0]);
      }
    } catch (error) {
      console.error('Failed to open directory dialog:', error);
    }
  };

  const handleRefreshExternal = useCallback(async () => {
    setRefreshing(true);
    try {
      const external = await ipcBridge.fs.detectAndCountExternalSkills.invoke();
      if (external.success && external.data) {
        setExternalSources(external.data);
        if (external.data.length > 0 && !external.data.find((s) => s.source === activeSourceTab)) {
          setActiveSourceTab(external.data[0].source);
        }
      }
      Message.success(t('common.refreshSuccess', { defaultValue: 'Refreshed' }));
    } catch (error) {
      console.error('Failed to refresh external skills:', error);
    } finally {
      setRefreshing(false);
    }
  }, [t, activeSourceTab]);

  const handleAddCustomPath = useCallback(async () => {
    if (!customPathName.trim() || !customPathValue.trim()) return;
    try {
      const result = await ipcBridge.fs.addCustomExternalPath.invoke({
        name: customPathName.trim(),
        path: customPathValue.trim(),
      });
      if (result.success) {
        setShowAddPathModal(false);
        setCustomPathName('');
        setCustomPathValue('');
        void handleRefreshExternal();
      } else {
        Message.error(result.msg || 'Failed to add path');
      }
    } catch (error) {
      Message.error('Failed to add custom path');
    }
  }, [customPathName, customPathValue, handleRefreshExternal]);

  const openAssignModal = useCallback(
    (skill: SkillMetadata) => {
      const usedAssistantIds = assistants
        .filter((assistant) => assistant.enabledSkills?.includes(skill.name))
        .map((assistant) => assistant.id);
      setSelectedSkill(skill);
      setSelectedAssistantIds(usedAssistantIds);
      setAssignModalVisible(true);
    },
    [assistants]
  );

  const handleSaveAssignments = useCallback(async () => {
    if (!selectedSkill) return;
    setAssigning(true);
    try {
      const currentAgents = ((await ConfigStorage.get('acp.customAgents')) || []) as AcpBackendConfig[];
      const selectedIdSet = new Set(selectedAssistantIds);
      const hubAssistantIdSet = new Set(
        assistants.map((assistant) => assistant.id).filter((id): id is string => typeof id === 'string' && id.length > 0)
      );
      const updatedAgents = currentAgents.map((assistant) => {
        if (!assistant.id || !hubAssistantIdSet.has(assistant.id)) {
          return assistant;
        }

        const currentEnabledSkills = Array.isArray(assistant.enabledSkills) ? assistant.enabledSkills : [];
        const currentCustomSkillNames = Array.isArray(assistant.customSkillNames) ? assistant.customSkillNames : [];
        const nextEnabledSkills = selectedIdSet.has(assistant.id)
          ? Array.from(new Set([...currentEnabledSkills, selectedSkill.name]))
          : currentEnabledSkills.filter((skillName) => skillName !== selectedSkill.name);

        const nextCustomSkillNames = selectedSkill.isCustom
          ? selectedIdSet.has(assistant.id)
            ? Array.from(new Set([...currentCustomSkillNames, selectedSkill.name]))
            : currentCustomSkillNames.filter((skillName) => skillName !== selectedSkill.name)
          : currentCustomSkillNames;

        return {
          ...assistant,
          enabledSkills: nextEnabledSkills,
          customSkillNames: nextCustomSkillNames,
        };
      });

      await ConfigStorage.set('acp.customAgents', updatedAgents);
      setAssistants(updatedAgents.filter((assistant) => hubAssistantIdSet.has(assistant.id)));
      setAssignModalVisible(false);
      Message.success(
        t('settings.skillsHub.assignmentSaved', {
          defaultValue: 'Skill assignment updated',
        })
      );
    } catch (error) {
      console.error('Failed to save skill assignments:', error);
      Message.error(
        t('settings.skillsHub.assignmentSaveFailed', {
          defaultValue: 'Failed to update skill assignment',
        })
      );
    } finally {
      setAssigning(false);
    }
  }, [assistants, selectedAssistantIds, selectedSkill, t]);

  // Open modal to configure skills for a specific assistant
  const openConfigAssistantSkills = useCallback((assistant: AssistantListItem) => {
    setConfigAssistantTarget(assistant);
    setConfigAssistantSkillIds(Array.isArray(assistant.enabledSkills) ? assistant.enabledSkills : []);
    setConfigAssistantSearch('');
    setConfigAssistantVisible(true);
  }, []);

  const handleSaveConfigAssistantSkills = useCallback(async () => {
    if (!configAssistantTarget) return;
    setConfigAssistantSaving(true);
    try {
      const currentAgents = ((await ConfigStorage.get('acp.customAgents')) || []) as AssistantListItem[];
      const updatedAgents = currentAgents.map((a) => {
        if (a.id !== configAssistantTarget.id) return a;
        const prevCustom = Array.isArray(a.customSkillNames) ? a.customSkillNames : [];
        const nextCustom = prevCustom.filter((n) => configAssistantSkillIds.includes(n));
        configAssistantSkillIds.forEach((id) => {
          const skill = availableSkills.find((s) => s.name === id);
          if (skill?.isCustom && !nextCustom.includes(id)) nextCustom.push(id);
        });
        return { ...a, enabledSkills: configAssistantSkillIds, customSkillNames: nextCustom };
      });
      await ConfigStorage.set('acp.customAgents', updatedAgents);
      setAssistants((prev) =>
        prev.map((a) =>
          a.id === configAssistantTarget.id ? { ...a, enabledSkills: configAssistantSkillIds } : a
        )
      );
      Message.success(t('settings.skillsHub.configAssistantSaved', { defaultValue: '技能配置已保存' }));
      setConfigAssistantVisible(false);
    } catch (err) {
      console.error('Failed to save assistant skills:', err);
      Message.error(t('settings.skillsHub.configAssistantFailed', { defaultValue: '保存失败' }));
    } finally {
      setConfigAssistantSaving(false);
    }
  }, [availableSkills, configAssistantSkillIds, configAssistantTarget, t]);

  // Navigate to assistant editor
  const OPEN_ASSISTANT_EDITOR_INTENT_KEY = 'guid.openAssistantEditorIntent';
  const openAssistantEditor = useCallback(
    (assistant: AssistantListItem) => {
      try {
        sessionStorage.setItem(
          OPEN_ASSISTANT_EDITOR_INTENT_KEY,
          JSON.stringify({ assistantId: assistant.id, openAssistantEditor: true })
        );
      } catch {
        // ignore
      }
      navigate('/workspace/settings/assistants');
    },
    [navigate]
  );

  const openReplaceModal = useCallback(() => {
    setReplaceFromSkill('');
    setReplaceToSkill('');
    setReplaceAssistantIds([]);
    setReplaceModalVisible(true);
  }, []);

  const openRemoveModal = useCallback(
    (skill: SkillMetadata) => {
      const ids = assistants
        .filter((assistant) => assistant.enabledSkills?.includes(skill.name))
        .map((assistant) => assistant.id);
      if (ids.length === 0) {
        Message.info(
          t('settings.skillsHub.removeNoUsers', {
            defaultValue: 'No assistant currently uses this skill.',
          })
        );
        return;
      }
      setRemoveTargetSkill(skill);
      setRemoveAssistantIds(ids);
      setRemoveModalVisible(true);
    },
    [assistants, t]
  );

  const handleSaveRemoveFromAssistants = useCallback(async () => {
    if (!removeTargetSkill) return;
    const removeIdSet = new Set(removeAssistantIds);
    if (removeIdSet.size === 0) {
      Message.warning(
        t('settings.skillsHub.removeNothingToDo', {
          defaultValue: 'Select at least one assistant to remove the skill from.',
        })
      );
      return;
    }

    setRemoveSaving(true);
    try {
      const hubAssistantIdSet = new Set(
        assistants.map((assistant) => assistant.id).filter((id): id is string => typeof id === 'string' && id.length > 0)
      );
      const currentAgents = ((await ConfigStorage.get('acp.customAgents')) || []) as AcpBackendConfig[];
      let affected = 0;

      const updatedAgents = currentAgents.map((assistant) => {
        if (!assistant.id || !hubAssistantIdSet.has(assistant.id) || !removeIdSet.has(assistant.id)) {
          return assistant;
        }
        const currentEnabledSkills = Array.isArray(assistant.enabledSkills) ? assistant.enabledSkills : [];
        if (!currentEnabledSkills.includes(removeTargetSkill.name)) {
          return assistant;
        }
        affected += 1;
        const nextEnabledSkills = currentEnabledSkills.filter((name) => name !== removeTargetSkill.name);
        const currentCustomSkillNames = Array.isArray(assistant.customSkillNames) ? assistant.customSkillNames : [];
        const nextCustomSkillNames = removeTargetSkill.isCustom
          ? currentCustomSkillNames.filter((name) => name !== removeTargetSkill.name)
          : currentCustomSkillNames;

        return {
          ...assistant,
          enabledSkills: nextEnabledSkills,
          customSkillNames: nextCustomSkillNames,
        };
      });

      await ConfigStorage.set('acp.customAgents', updatedAgents);
      setAssistants(updatedAgents.filter((assistant) => hubAssistantIdSet.has(assistant.id)));
      setRemoveModalVisible(false);
      setRemoveTargetSkill(null);
      setRemoveAssistantIds([]);
      Message.success(
        t('settings.skillsHub.removeSaved', {
          count: affected,
          defaultValue: `Removed from ${affected} assistant(s).`,
        })
      );
    } catch (error) {
      console.error('Failed to remove skill from assistants:', error);
      Message.error(
        t('settings.skillsHub.removeSaveFailed', {
          defaultValue: 'Failed to remove skill from assistants.',
        })
      );
    } finally {
      setRemoveSaving(false);
    }
  }, [assistants, removeAssistantIds, removeTargetSkill, t]);

  const handleStripListedSkillsFromAssistant = useCallback(
    async (assistantId: string, skillNames: string[]) => {
      const uniqueNames = Array.from(new Set(skillNames.filter((name) => name.length > 0)));
      if (uniqueNames.length === 0) return;

      const hubAssistantIdSet = new Set(
        assistants.map((assistant) => assistant.id).filter((id): id is string => typeof id === 'string' && id.length > 0)
      );
      try {
        const currentAgents = ((await ConfigStorage.get('acp.customAgents')) || []) as AcpBackendConfig[];
        const nameSet = new Set(uniqueNames);
        const updatedAgents = currentAgents.map((assistant) => {
          if (assistant.id !== assistantId) {
            return assistant;
          }
          const currentEnabledSkills = Array.isArray(assistant.enabledSkills) ? assistant.enabledSkills : [];
          const nextEnabledSkills = currentEnabledSkills.filter((name) => !nameSet.has(name));
          const currentCustomSkillNames = Array.isArray(assistant.customSkillNames) ? assistant.customSkillNames : [];
          const nextCustomSkillNames = currentCustomSkillNames.filter((name) => !nameSet.has(name));

          return {
            ...assistant,
            enabledSkills: nextEnabledSkills,
            customSkillNames: nextCustomSkillNames,
          };
        });

        await ConfigStorage.set('acp.customAgents', updatedAgents);
        setAssistants(updatedAgents.filter((assistant) => hubAssistantIdSet.has(assistant.id)));
        Message.success(
          t('settings.skillsHub.stripAssistantSkillsSaved', {
            count: uniqueNames.length,
            defaultValue: `Removed ${uniqueNames.length} skill(s) from this assistant.`,
          })
        );
      } catch (error) {
        console.error('Failed to strip skills from assistant:', error);
        Message.error(
          t('settings.skillsHub.stripAssistantSkillsFailed', {
            defaultValue: 'Failed to update assistant skills.',
          })
        );
      }
    },
    [assistants, t]
  );

  const syncReplaceAssistantSelection = useCallback(
    (fromSkillName: string) => {
      if (!fromSkillName.trim()) {
        setReplaceAssistantIds([]);
        return;
      }
      const ids = assistants
        .filter((assistant) => assistant.enabledSkills?.includes(fromSkillName))
        .map((assistant) => assistant.id);
      setReplaceAssistantIds(ids);
    },
    [assistants]
  );

  const handleSaveBatchReplace = useCallback(async () => {
    if (!replaceFromSkill.trim() || !replaceToSkill.trim()) {
      Message.error(
        t('settings.skillsHub.replacePickBothSkills', {
          defaultValue: 'Select both the source and target skills.',
        })
      );
      return;
    }
    if (replaceFromSkill === replaceToSkill) {
      Message.error(
        t('settings.skillsHub.replaceSameSkillError', {
          defaultValue: 'Source and target skills must be different.',
        })
      );
      return;
    }
    const fromMeta = availableSkills.find((skill) => skill.name === replaceFromSkill);
    const toMeta = availableSkills.find((skill) => skill.name === replaceToSkill);
    if (!fromMeta || !toMeta) {
      Message.error(t('settings.skillsHub.replaceUnknownSkill', { defaultValue: 'Unknown skill selected.' }));
      return;
    }

    setReplaceSaving(true);
    try {
      const targetIdSet = new Set(replaceAssistantIds);
      const currentAgents = ((await ConfigStorage.get('acp.customAgents')) || []) as AcpBackendConfig[];
      const hubAssistantIdSet = new Set(
        assistants.map((assistant) => assistant.id).filter((id): id is string => typeof id === 'string' && id.length > 0)
      );
      const replaceTargets = currentAgents.filter(
        (assistant) =>
          Boolean(assistant.id) &&
          hubAssistantIdSet.has(assistant.id) &&
          targetIdSet.has(assistant.id) &&
          Array.isArray(assistant.enabledSkills) &&
          assistant.enabledSkills.includes(replaceFromSkill)
      );
      if (replaceTargets.length === 0) {
        Message.warning(
          t('settings.skillsHub.replaceNothingToDo', {
            defaultValue: 'No selected assistant currently uses the source skill.',
          })
        );
        setReplaceSaving(false);
        return;
      }

      let affected = 0;

      const updatedAgents = currentAgents.map((assistant) => {
        if (!assistant.id || !hubAssistantIdSet.has(assistant.id) || !targetIdSet.has(assistant.id)) {
          return assistant;
        }
        const currentEnabledSkills = Array.isArray(assistant.enabledSkills) ? assistant.enabledSkills : [];
        if (!currentEnabledSkills.includes(replaceFromSkill)) {
          return assistant;
        }
        affected += 1;
        const withoutFrom = currentEnabledSkills.filter((name) => name !== replaceFromSkill);
        const nextEnabledSkills = withoutFrom.includes(replaceToSkill)
          ? withoutFrom
          : [...withoutFrom, replaceToSkill];

        const currentCustomSkillNames = Array.isArray(assistant.customSkillNames) ? assistant.customSkillNames : [];
        let nextCustomSkillNames = currentCustomSkillNames;
        if (fromMeta.isCustom) {
          nextCustomSkillNames = nextCustomSkillNames.filter((name) => name !== replaceFromSkill);
        }
        if (toMeta.isCustom) {
          nextCustomSkillNames = Array.from(new Set([...nextCustomSkillNames, replaceToSkill]));
        }

        return {
          ...assistant,
          enabledSkills: nextEnabledSkills,
          customSkillNames: nextCustomSkillNames,
        };
      });

      await ConfigStorage.set('acp.customAgents', updatedAgents);
      setAssistants(updatedAgents.filter((assistant) => hubAssistantIdSet.has(assistant.id)));
      setReplaceModalVisible(false);
      setReplaceFromSkill('');
      setReplaceToSkill('');
      setReplaceAssistantIds([]);
      Message.success(
        t('settings.skillsHub.replaceSaved', {
          count: affected,
          defaultValue: `Updated ${affected} assistant(s).`,
        })
      );
    } catch (error) {
      console.error('Failed to batch replace skills:', error);
      Message.error(
        t('settings.skillsHub.replaceSaveFailed', {
          defaultValue: 'Failed to apply batch replace.',
        })
      );
    } finally {
      setReplaceSaving(false);
    }
  }, [assistants, availableSkills, replaceAssistantIds, replaceFromSkill, replaceToSkill, t]);

  const renderSkillUsageSummary = useCallback(
    (skill: SkillMetadata) => {
      const usage = skillUsageMap.get(skill.name);
      if (!usage) return null;

      return (
        <div className='flex flex-col gap-6px'>
          <div className='flex flex-wrap items-center gap-6px'>
            <Tag size='small' color={usage.usedByAssistants.length > 0 ? 'green' : 'gray'}>
              {usage.usedByAssistants.length > 0
                ? t('settings.skillsHub.assignedToCount', {
                    count: usage.usedByAssistants.length,
                    defaultValue: `已分配 ${usage.usedByAssistants.length} 个助手`,
                  })
                : t('settings.skillsHub.agentDefault', { defaultValue: 'AGENT 默认调用' })}
            </Tag>
          </div>
          {usage.usedByAssistants.length > 0 && (
            <div className='flex flex-wrap gap-6px'>
              {usage.usedByAssistants.slice(0, 6).map((assistant) => (
                <button
                  key={`${skill.name}-${assistant.id}`}
                  type='button'
                  title={t('settings.skillsHub.configureAssistant', {
                    name: getAssistantDisplayName(assistant),
                    defaultValue: '配置 {{name}}',
                  })}
                  className='text-12px text-t-secondary px-8px py-3px rd-[100px] bg-fill-1 border border-border-1 cursor-pointer hover:bg-primary-1 hover:text-primary-6 hover:border-primary-4 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary-5'
                  onClick={(e) => {
                    e.stopPropagation();
                    openAssignModal(skill);
                  }}
                >
                  {getAssistantDisplayName(assistant)}
                </button>
              ))}
              {usage.usedByAssistants.length > 6 && (
                <span className='text-12px text-t-tertiary'>
                  {t('settings.skillsHub.moreAssistants', {
                    count: usage.usedByAssistants.length - 6,
                    defaultValue: `+${usage.usedByAssistants.length - 6} more`,
                  })}
                </span>
              )}
            </div>
          )}
        </div>
      );
    },
    [getAssistantDisplayName, openAssignModal, skillUsageMap, t]
  );

  const renderMySkillRow = (skill: SkillMetadata) => {
    const usage = skillUsageMap.get(skill.name);
    const conflictTag = renderSkillMetaTags(skill);
    return (
      <div
        key={skill.name}
        data-testid={`my-skill-row-${skill.name}`}
        className='group grid grid-cols-[minmax(160px,2fr)_minmax(0,3fr)_minmax(0,2.5fr)_40px] items-center gap-12px px-12px py-10px hover:bg-fill-1 rd-8px transition-all duration-150 cursor-pointer border border-transparent hover:border-border-1'
        role='button'
        tabIndex={0}
        onClick={() => setMySkillPreview(skill)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setMySkillPreview(skill);
          }
        }}
      >
        {/* Col 1: name + badge */}
        <div className='flex items-center gap-8px min-w-0' onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
          <div
            className={`w-28px h-28px shrink-0 rd-6px flex items-center justify-center font-bold text-12px text-transform-uppercase ${getAvatarColorClass(skill.name)}`}
          >
            {skill.name.charAt(0).toUpperCase()}
          </div>
          <button
            type='button'
            className='text-13px font-medium text-t-primary truncate hover:text-primary-6 transition-colors cursor-pointer bg-transparent border-none outline-none p-0'
            onClick={() => setMySkillPreview(skill)}
          >
            {skill.name}
          </button>
          {skill.isCustom ? (
            <span className='shrink-0 bg-[rgba(var(--orange-6),0.08)] text-orange-6 border border-[rgba(var(--orange-6),0.2)] text-10px px-5px py-0px rd-4px font-medium'>
              {t('settings.skillsHub.installed', { defaultValue: '已安装' })}
            </span>
          ) : (
            <span className='shrink-0 bg-[rgba(var(--blue-6),0.08)] text-blue-6 border border-[rgba(var(--blue-6),0.2)] text-10px px-5px py-0px rd-4px font-medium'>
              {t('settings.skillsHub.official', { defaultValue: '官方' })}
            </span>
          )}
          {conflictTag}
        </div>

        {/* Col 2: description */}
        <p className='text-12px text-t-secondary leading-relaxed line-clamp-1 m-0' title={skill.description}>
          {skill.description || '—'}
        </p>

        {/* Col 3: used-by assistants */}
        <div className='flex flex-wrap items-center gap-4px'>
          {(usage?.usedByAssistants.length ?? 0) === 0 ? (
            <span className='text-11px text-t-secondary bg-fill-2 border border-border-1 px-8px py-2px rd-[100px]'>
              {t('settings.skillsHub.agentDefault', { defaultValue: 'AGENT 默认调用' })}
            </span>
          ) : (
            <>
              {usage!.usedByAssistants.slice(0, 3).map((assistant) => (
                <button
                  key={assistant.id}
                  type='button'
                  title={t('settings.skillsHub.configureAssistant', {
                    name: getAssistantDisplayName(assistant),
                    defaultValue: '配置 {{name}}',
                  })}
                  className='text-11px text-t-secondary px-7px py-2px rd-[100px] bg-fill-1 border border-border-1 cursor-pointer hover:bg-primary-1 hover:text-primary-6 hover:border-primary-4 transition-colors outline-none'
                  onClick={(e) => {
                    e.stopPropagation();
                    openAssignModal(skill);
                  }}
                >
                  {getAssistantDisplayName(assistant)}
                </button>
              ))}
              {(usage?.usedByAssistants.length ?? 0) > 3 && (
                <span className='text-11px text-t-tertiary'>
                  +{(usage?.usedByAssistants.length ?? 0) - 3}
                </span>
              )}
            </>
          )}
        </div>

        {/* Col 4: actions */}
        <div
          className='flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity'
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Dropdown
            trigger='click'
            position='br'
            droplist={
              <Menu>
                <Menu.Item key='assign' onClick={() => openAssignModal(skill)}>
                  {t('settings.skillsHub.assignToAssistants', { defaultValue: 'Assign to assistants' })}
                </Menu.Item>
                <Menu.Item key='remove' onClick={() => openRemoveModal(skill)}>
                  {t('settings.skillsHub.removeFromAssistants', { defaultValue: 'Remove from assistants' })}
                </Menu.Item>
                {externalSkillDirectory(skill) ? (
                  <Menu.Item key='folder' onClick={() => void handleOpenExternalSkillFolder(skill)}>
                    {t('settings.skillsHub.openSkillFolder', { defaultValue: 'Open folder in Explorer' })}
                  </Menu.Item>
                ) : null}
                {externalSources.length > 0 ? (
                  <Menu.SubMenu
                    key='export'
                    title={t('settings.skillsHub.exportTo', { defaultValue: 'Export To...' })}
                  >
                    {externalSources.map((source) => (
                      <Menu.Item
                        key={source.source}
                        onClick={() => {
                          void runExportSkillToTarget(skill, source.path);
                        }}
                      >
                        {source.name}
                      </Menu.Item>
                    ))}
                  </Menu.SubMenu>
                ) : null}
                {skill.isCustom ? (
                  <Menu.Item
                    key='delete'
                    className='text-danger-6'
                    onClick={() => {
                      Modal.confirm({
                        title: t('settings.skillsHub.deleteConfirmTitle', { defaultValue: 'Delete Skill' }),
                        content: t('settings.skillsHub.deleteConfirmContent', {
                          name: skill.name,
                          defaultValue: `Are you sure you want to delete "${skill.name}"?`,
                        }),
                        okButtonProps: { status: 'danger' },
                        onOk: () => void handleDelete(skill.name),
                      });
                    }}
                  >
                    {t('common.delete', { defaultValue: 'Delete' })}
                  </Menu.Item>
                ) : null}
              </Menu>
            }
          >
            <button
              type='button'
              className='px-10px py-5px text-12px font-medium text-primary-6 hover:text-primary-5 bg-primary-1 hover:bg-primary-2 rd-6px outline-none border border-primary-3 cursor-pointer transition-colors whitespace-nowrap'
              data-testid={`my-skill-quick-${skill.name}`}
            >
              {t('settings.skillsHub.viewSkill', { defaultValue: '查看 SKILL' })}
            </button>
          </Dropdown>
        </div>
      </div>
    );
  };

  const totalExternal = externalSources.reduce((sum, src) => sum + src.skills.length, 0);
  const activeSource = externalSources.find((s) => s.source === activeSourceTab);

  const filteredExternalSkills = useMemo(() => {
    if (!activeSource) return [];
    const lowerQuery = searchExternalQuery.toLowerCase();
    return activeSource.skills.filter((skill) => {
      const status = externalSkillImportStatusMap.get(skill.name);
      if (externalSkillFilter === 'unimported' && status) return false;
      if (externalSkillFilter === 'imported' && status !== 'user') return false;
      if (externalSkillFilter === 'conflict' && status !== 'builtin') return false;
      if (!searchExternalQuery.trim()) return true;
      return (
        skill.name.toLowerCase().includes(lowerQuery) ||
        (skill.description && skill.description.toLowerCase().includes(lowerQuery))
      );
    });
  }, [activeSource, searchExternalQuery, externalSkillFilter, externalSkillImportStatusMap]);

  const externalPreviewStatus = externalPreviewSkill
    ? externalSkillImportStatusMap.get(externalPreviewSkill.name)
    : undefined;

  return (
    <>
      <SettingsPageWrapper>
        <div className='flex flex-col h-full w-full'>
          <div className='pb-24px'>
            {/* ======== Tab Navigation ======== */}
            <div className='flex items-center gap-8px mb-24px'>
              {/* 我的技能 — warm primary color when active */}
              <button
                type='button'
                className={`inline-flex items-center gap-8px px-20px py-9px text-13px font-medium rd-[100px] transition-all cursor-pointer outline-none border ${
                  activeMainTab === 'library'
                    ? 'bg-primary-6 border-primary-6 text-white shadow-sm'
                    : 'bg-base border-border-1 text-t-secondary hover:text-t-primary hover:border-border-2'
                }`}
                onClick={() => setActiveMainTab('library')}
              >
                {t('settings.skillsHub.tabLibrary', { defaultValue: '我的技能' })}
                <span
                  className={`text-11px px-7px py-1px rd-[100px] font-medium ${
                    activeMainTab === 'library' ? 'bg-white/25 text-white' : 'bg-fill-2 text-t-tertiary'
                  }`}
                >
                  {availableSkills.length}
                </span>
              </button>

              {/* 发现 — brand/teal color when active (cool tone contrast) */}
              <button
                type='button'
                className={`inline-flex items-center gap-8px px-20px py-9px text-13px font-medium rd-[100px] transition-all cursor-pointer outline-none border ${
                  activeMainTab === 'discover'
                    ? 'bg-brand border-brand text-white shadow-sm'
                    : 'bg-base border-border-1 text-t-secondary hover:text-t-primary hover:border-border-2'
                }`}
                onClick={() => setActiveMainTab('discover')}
              >
                {t('settings.skillsHub.tabDiscover', { defaultValue: '发现' })}
                {totalExternal > 0 && (
                  <span
                    className={`text-11px px-7px py-1px rd-[100px] font-medium ${
                      activeMainTab === 'discover' ? 'bg-white/25 text-white' : 'bg-fill-2 text-t-tertiary'
                    }`}
                  >
                    {totalExternal}
                  </span>
                )}
              </button>
            </div>

            <div className='space-y-16px'>
            {/* ======== 发现外部技能 / Discovered External Skills ======== */}
            {activeMainTab === 'discover' && totalExternal > 0 && (
              <div className='px-[16px] md:px-[32px] py-24px bg-base rd-16px md:rd-24px shadow-sm border border-b-base relative overflow-hidden transition-all'>
                {/* Section toolbar: description + search + refresh */}
                <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-12px mb-20px relative z-10'>
                  <Typography.Text className='text-13px text-t-secondary leading-relaxed'>
                    {t('settings.skillsHub.discoveryAlert', {
                      defaultValue: '检测到来自 CLI 工具的技能，导入后可在 1ONE ClaudeCode 中使用。',
                    })}
                  </Typography.Text>
                  <div className='flex items-center gap-8px shrink-0'>
                    <div className='relative group w-full sm:w-[200px]'>
                      <div className='absolute left-12px top-1/2 -translate-y-1/2 text-t-tertiary group-focus-within:text-primary-6 flex pointer-events-none transition-colors'>
                        <Search size={15} />
                      </div>
                      <input
                        type='text'
                        className='w-full bg-fill-1 hover:bg-fill-2 border border-border-1 focus:border-primary-5 focus:bg-base outline-none rd-8px py-6px pl-36px pr-12px text-13px text-t-primary placeholder:text-t-tertiary transition-all shadow-sm box-border m-0'
                        placeholder={t('settings.skillsHub.searchPlaceholder', { defaultValue: '搜索技能...' })}
                        value={searchExternalQuery}
                        onChange={(e) => setSearchExternalQuery(e.target.value)}
                      />
                    </div>
                    <button
                      className='outline-none border-none bg-transparent cursor-pointer p-6px text-t-tertiary hover:text-primary-6 transition-colors rd-full hover:bg-fill-2'
                      onClick={() => void handleRefreshExternal()}
                      title={t('common.refresh', { defaultValue: 'Refresh' })}
                    >
                      <Refresh theme='outline' size={16} className={refreshing ? 'animate-spin' : ''} />
                    </button>
                  </div>
                </div>

                {/* Toolbar (Tabs) */}
                <div className='flex flex-wrap items-center gap-8px mb-20px relative z-10 w-full'>
                  {externalSources.map((source) => {
                    const isActive = activeSourceTab === source.source;
                    return (
                      <button
                        key={source.source}
                        type='button'
                        className={`outline-none cursor-pointer px-16px py-6px text-13px rd-[100px] transition-all duration-300 flex items-center gap-6px border ${isActive ? 'bg-primary-6 border-primary-6 text-white shadow-md font-medium' : 'bg-base border-border-1 text-t-secondary hover:bg-fill-1 hover:text-t-primary'}`}
                        onClick={() => setActiveSourceTab(source.source)}
                      >
                        {source.name}
                        <span
                          className={`px-6px py-1px rd-[100px] text-11px flex items-center justify-center transition-colors ${isActive ? 'bg-white/20 text-white font-medium' : 'bg-fill-2 text-t-secondary border border-transparent'}`}
                        >
                          {source.skills.length}
                        </span>
                      </button>
                    );
                  })}
                  <button
                    type='button'
                    className='outline-none border border-dashed border-border-1 hover:border-primary-4 cursor-pointer w-28px h-28px ml-4px text-t-tertiary hover:text-primary-6 hover:bg-primary-1 rd-full transition-all duration-300 flex items-center justify-center bg-transparent shrink-0'
                    onClick={() => setShowAddPathModal(true)}
                    title={t('common.add', { defaultValue: 'Add' })}
                  >
                    <Plus size={16} />
                  </button>
                  <Select
                    size='small'
                    value={externalSkillFilter}
                    onChange={(value) => setExternalSkillFilter(value as 'all' | 'unimported' | 'imported' | 'conflict')}
                    options={[
                      { value: 'all', label: t('settings.skillsHub.externalFilterAll', { defaultValue: 'All' }) },
                      { value: 'unimported', label: t('settings.skillsHub.externalFilterUnimported', { defaultValue: 'Unimported' }) },
                      { value: 'imported', label: t('settings.skillsHub.externalFilterImported', { defaultValue: 'Already imported' }) },
                      { value: 'conflict', label: t('settings.skillsHub.externalFilterConflicts', { defaultValue: 'Name conflicts' }) },
                    ]}
                    className='w-[180px]'
                  />
                </div>
                {/* Active tab content */}
                {activeSource && (
                  <div className='flex flex-col'>
                    <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-12px py-8px mb-4px'>
                      <div className='flex items-center gap-8px text-12px text-t-tertiary font-mono min-w-0 bg-transparent py-4px'>
                        <FolderOpen size={16} className='shrink-0' />
                        <span className='truncate' title={activeSource.path}>
                          {activeSource.path}
                        </span>
                      </div>
                      <button
                        className='flex items-center gap-6px text-13px font-medium text-primary-6 hover:text-primary-5 transition-colors bg-transparent border-none outline-none cursor-pointer whitespace-nowrap'
                        onClick={() => void handleImportAll(activeSource.skills)}
                      >
                        {t('settings.skillsHub.importAll', { defaultValue: 'Import All' })}
                      </button>
                    </div>

                    <div className='max-h-[360px] overflow-y-auto custom-scrollbar flex flex-col gap-6px pr-4px'>
                      {filteredExternalSkills.map((skill) => (
                        <div
                          key={externalSkillDirectory(skill) || skill.name}
                          data-testid={`external-skill-row-${skill.name}`}
                          role='button'
                          tabIndex={0}
                          className='group flex flex-col sm:flex-row gap-16px p-16px bg-base border border-transparent hover:border-border-1 hover:bg-fill-1 hover:shadow-sm rd-12px transition-all duration-200 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-5'
                          onClick={() => setExternalPreviewSkill(skill)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setExternalPreviewSkill(skill);
                            }
                          }}
                        >
                          <div className='shrink-0 flex items-start sm:mt-2px'>
                            <div className='w-40px h-40px rd-full bg-base border border-border-1 flex items-center justify-center font-bold text-16px text-t-primary shadow-sm transition-all text-transform-uppercase'>
                              {skill.name.charAt(0)}
                            </div>
                          </div>
                          <div className='flex-1 min-w-0 flex flex-col justify-center'>
                            <h3 className='text-14px font-semibold text-t-primary/90 mb-6px truncate m-0'>
                              {skill.name}
                            </h3>
                            <div className='mb-6px'>{renderSkillMetaTags(skill)}</div>
                            <div className='flex flex-wrap gap-6px mb-6px'>{renderExternalSkillStatusTag(skill)}</div>
                            {skill.description && (
                              <p
                                className='text-13px text-t-secondary leading-relaxed line-clamp-2 m-0'
                                title={skill.description}
                              >
                                {skill.description}
                              </p>
                            )}
                          </div>
                          <div className='shrink-0 sm:self-center flex items-center mt-8px sm:mt-0 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity'>
                            <Button
                              size='small'
                              type='primary'
                              status='default'
                              disabled={externalSkillImportStatusMap.get(skill.name) === 'builtin'}
                              title={
                                externalSkillImportStatusMap.get(skill.name) === 'builtin'
                                  ? t('settings.skillsHub.externalSkillImportBlocked', {
                                      defaultValue: 'Cannot import due to built-in skill name conflict',
                                    })
                                  : undefined
                              }
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleImport(externalSkillDirectory(skill), { skillName: skill.name });
                              }}
                              className='rd-[100px] shadow-sm px-16px'
                            >
                              {t('common.import', { defaultValue: 'Import' })}
                            </Button>
                          </div>
                        </div>
                      ))}
                      {filteredExternalSkills.length === 0 && (
                        <div className='text-center text-t-secondary text-13px py-40px bg-fill-1 rd-12px border border-b-base border-dashed'>
                          {t('settings.skillsHub.noSearchResults', { defaultValue: 'No matching skills found' })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            {activeMainTab === 'discover' && totalExternal === 0 && (
              <div className='text-center text-t-secondary text-13px py-60px bg-fill-1 rd-16px border border-b-base border-dashed flex flex-col items-center gap-12px'>
                <span className='text-32px opacity-30'>🔍</span>
                <div className='flex flex-col gap-4px'>
                  <p className='m-0 font-medium text-t-primary'>
                    {t('settings.skillsHub.discoverEmpty', { defaultValue: '未发现外部技能' })}
                  </p>
                  <p className='m-0 text-12px'>
                    {t('settings.skillsHub.discoverEmptyHint', {
                      defaultValue: '将 CLI 工具（Claude Code、Gemini、Agents）的技能目录添加到此处',
                    })}
                  </p>
                </div>
                <button
                  type='button'
                  className='px-16px py-8px bg-primary-6 text-white rd-8px text-13px font-medium hover:bg-primary-5 transition-colors cursor-pointer border-none outline-none'
                  onClick={() => setShowAddPathModal(true)}
                >
                  {t('settings.skillsHub.addCustomPath', { defaultValue: '添加技能路径' })}
                </button>
              </div>
            )}

            {/* ======== 我的技能 / My Skills ======== */}
            {activeMainTab === 'library' && (
            <div className='px-[16px] md:px-[32px] py-32px bg-base rd-16px md:rd-24px shadow-sm border border-b-base relative overflow-hidden transition-all'>
              {/* Toolbar for My Skills */}
              <div className='flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-12px mb-24px relative z-10'>
                <div className='relative group shrink-0 w-full sm:w-[240px]'>
                  <div className='absolute left-12px top-1/2 -translate-y-1/2 text-t-tertiary group-focus-within:text-primary-6 flex pointer-events-none transition-colors'>
                    <Search size={15} />
                  </div>
                  <input
                    type='text'
                    className='w-full bg-fill-1 hover:bg-fill-2 border border-border-1 focus:border-primary-5 focus:bg-base outline-none rd-8px py-6px pl-36px pr-12px text-13px text-t-primary placeholder:text-t-tertiary transition-all shadow-sm box-border m-0'
                    placeholder={t('settings.skillsHub.searchPlaceholder', { defaultValue: '搜索技能...' })}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <div className='flex items-center gap-8px shrink-0'>
                  <button
                    className='flex items-center justify-center gap-6px px-16px py-6px bg-base border border-border-1 hover:border-border-2 hover:bg-fill-1 text-t-primary rd-8px shadow-sm transition-all focus:outline-none cursor-pointer whitespace-nowrap'
                    onClick={handleManualImport}
                  >
                    <FolderOpen size={15} className='text-t-secondary' />
                    <span className='text-13px font-medium'>
                      {t('settings.skillsHub.manualImport', { defaultValue: '从文件夹导入' })}
                    </span>
                  </button>
                  <button
                    className='outline-none border-none bg-transparent cursor-pointer p-6px text-t-tertiary hover:text-primary-6 transition-colors rd-full hover:bg-fill-2'
                    onClick={async () => {
                      await fetchData();
                      Message.success(t('common.refreshSuccess', { defaultValue: 'Refreshed' }));
                    }}
                    title={t('common.refresh', { defaultValue: 'Refresh' })}
                  >
                    <Refresh theme='outline' size={16} className={loading ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>

              {/* Status Filter Pills + View Toggle */}
              <div className='flex flex-wrap items-center justify-between gap-10px mb-16px'>
                <div className='flex items-center gap-8px'>
                  {(['all', 'assigned', 'unassigned'] as const).map((mode) => (
                    <button
                      key={mode}
                      type='button'
                      className={`px-16px py-6px text-13px rd-[100px] transition-all border outline-none cursor-pointer font-medium ${
                        agentFilter === mode
                          ? 'bg-primary-6 border-primary-6 text-white shadow-sm'
                          : 'bg-base border-border-1 text-t-secondary hover:bg-fill-1 hover:text-t-primary'
                      }`}
                      onClick={() => {
                        setAgentFilter(mode);
                      }}
                    >
                      {mode === 'all'
                        ? t('settings.skillsHub.filterAll', { defaultValue: '全部' })
                        : mode === 'assigned'
                          ? t('settings.skillsHub.filterAssigned', { defaultValue: '已分配' })
                          : skillView === 'by-assistant'
                            ? t('settings.skillsHub.filterOnlyBuiltin', { defaultValue: '仅内置技能' })
                            : t('settings.skillsHub.filterAgentDefault', { defaultValue: 'AGENT 默认调用' })}
                      {mode === 'all' && (
                        <span
                          className={`ml-6px text-11px px-6px py-1px rd-[100px] ${agentFilter === 'all' ? 'bg-white/20 text-white' : 'bg-fill-2 text-t-tertiary'}`}
                        >
                          {availableSkills.length}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                <div className='flex items-center gap-8px'>
                  {/* View toggle: 按技能 / 按助手 */}
                  <div className='inline-flex bg-fill-2 p-2px rd-8px gap-1px'>
                    {(['by-skill', 'by-assistant'] as const).map((view) => (
                      <button
                        key={view}
                        type='button'
                        className={`px-12px py-5px text-12px rd-6px transition-all cursor-pointer border-none outline-none whitespace-nowrap font-medium ${
                          skillView === view
                            ? 'bg-base shadow-sm text-t-primary'
                            : 'bg-transparent text-t-secondary hover:text-t-primary'
                        }`}
                        onClick={() => setSkillView(view)}
                      >
                        {view === 'by-skill'
                          ? t('settings.skillsHub.viewBySkill', { defaultValue: '按技能' })
                          : t('settings.skillsHub.viewByAssistant', { defaultValue: '按助手' })}
                      </button>
                    ))}
                  </div>
                  {skillView === 'by-skill' && (
                    <Select
                      size='small'
                      className='w-[140px]'
                      value={skillSortMode}
                      onChange={(value) =>
                        setSkillSortMode(value as 'usage-desc' | 'usage-asc' | 'name-asc' | 'name-desc')
                      }
                      options={[
                        {
                          value: 'usage-desc',
                          label: t('settings.skillsHub.sortUsageDesc', { defaultValue: '使用最多' }),
                        },
                        {
                          value: 'name-asc',
                          label: t('settings.skillsHub.sortNameAsc', { defaultValue: '名称 A → Z' }),
                        },
                        {
                          value: 'name-desc',
                          label: t('settings.skillsHub.sortNameDesc', { defaultValue: '名称 Z → A' }),
                        },
                      ]}
                    />
                  )}
                  <Button size='small' type='outline' className='rounded-[100px]' onClick={() => openReplaceModal()}>
                    {t('settings.skillsHub.batchReplace', { defaultValue: '批量替换' })}
                  </Button>
                </div>
              </div>

              {/* Path Display */}
              {skillPaths && (
                <div className='flex items-center gap-8px text-12px text-t-tertiary font-mono bg-transparent py-4px mb-16px relative z-10 pt-4px border-t border-t-transparent'>
                  <FolderOpen size={16} className='shrink-0' />
                  <span className='truncate' title={skillPaths.userSkillsDir}>
                    {skillPaths.userSkillsDir}
                  </span>
                </div>
              )}

              {availableSkills.length > 0 ? (
                <div className='w-full flex flex-col gap-0 relative z-10'>
                  {skillView === 'by-skill' ? (
                    <>
                      {/* Table header */}
                      <div className='grid grid-cols-[minmax(160px,2fr)_minmax(0,3fr)_minmax(0,2.5fr)_40px] items-center gap-12px px-12px py-8px mb-2px bg-fill-2 rd-8px'>
                        <span className='text-11px font-semibold text-t-tertiary uppercase tracking-wider'>
                          {t('settings.skillsHub.colSkill', { defaultValue: '技能' })}
                        </span>
                        <span className='text-11px font-semibold text-t-tertiary uppercase tracking-wider'>
                          {t('settings.skillsHub.colDescription', { defaultValue: '描述' })}
                        </span>
                        <span className='text-11px font-semibold text-t-tertiary uppercase tracking-wider'>
                          {t('settings.skillsHub.colUsedBy', { defaultValue: '使用中的助手' })}
                        </span>
                        <span />
                      </div>
                      {displaySkills.length > 0 ? (
                        displaySkills.map(renderMySkillRow)
                      ) : (
                        <div className='text-center text-t-secondary text-13px py-32px bg-fill-1 rd-8px border border-b-base border-dashed mt-4px'>
                          {t('settings.skillsHub.noSearchResults', { defaultValue: 'No matching skills found' })}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {/* By-assistant view — compact single-row table */}
                      {groupedByAssistantData.sections.length === 0 && groupedByAssistantData.unassignedSkills.length === 0 ? (
                        <div className='text-center text-t-secondary text-13px py-32px bg-fill-1 rd-8px border border-b-base border-dashed'>
                          {t('settings.skillsHub.noSkillsAssigned', { defaultValue: '当前筛选条件下无结果' })}
                        </div>
                      ) : (
                        <>
                          {/* Table header */}
                          <div className='grid grid-cols-[minmax(180px,2fr)_1fr_160px] items-center gap-12px px-12px py-8px mb-2px bg-fill-2 rd-8px'>
                            <span className='text-11px font-semibold text-t-tertiary uppercase tracking-wider'>
                              {t('settings.skillsHub.colAssistant', { defaultValue: '助手' })}
                            </span>
                            <span className='text-11px font-semibold text-t-tertiary uppercase tracking-wider'>
                              {t('settings.skillsHub.colEnabledSkills', { defaultValue: '已启用技能' })}
                            </span>
                            <span />
                          </div>

                          {groupedByAssistantData.sections.map(({ assistant, skills, totalEnabledCount, missingCount }) => (
                            <div
                              key={assistant.id}
                              className='group grid grid-cols-[minmax(180px,2fr)_1fr_160px] items-center gap-12px px-12px py-10px hover:bg-fill-1 rd-8px transition-all duration-150 border border-transparent hover:border-border-1'
                            >
                              {/* Col 1: Identity */}
                              <div className='flex items-center gap-8px min-w-0'>
                                <div
                                  className={`w-28px h-28px shrink-0 rd-8px flex items-center justify-center font-bold text-11px text-transform-uppercase ${getAvatarColorClass(assistant.name)}`}
                                >
                                  {(assistant.nameI18n?.['zh-CN'] || assistant.name)?.charAt(0)?.toUpperCase()}
                                </div>
                                <div className='flex flex-col min-w-0'>
                                  <span className='text-13px font-medium text-t-primary truncate'>
                                    {getAssistantDisplayName(assistant)}
                                  </span>
                                  {assistant.presetAgentType && (
                                    <span className='text-10px text-t-tertiary'>
                                      {getAgentLabel(assistant.presetAgentType)}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Col 2: Optional skill chips + system note (fully symmetric with 按技能 view) */}
                              <div className='flex flex-wrap items-center gap-4px'>
                                {skills.length === 0 ? (
                                  <span className='text-11px text-t-tertiary'>
                                    {t('settings.skillsHub.noOptionalSkills', { defaultValue: '未配置可选技能' })}
                                  </span>
                                ) : (
                                  <>
                                    {skills.slice(0, 3).map((skill) => (
                                      <button
                                        key={skill.name}
                                        type='button'
                                        className='text-11px px-8px py-3px rd-[100px] bg-primary-1 border border-primary-3 text-primary-6 hover:bg-primary-2 transition-colors cursor-pointer outline-none'
                                        onClick={() => setMySkillPreview(skill)}
                                        title={skill.description}
                                      >
                                        {skill.name}
                                      </button>
                                    ))}
                                    {skills.length > 3 && (
                                      <span className='text-11px text-t-tertiary px-4px'>+{skills.length - 3}</span>
                                    )}
                                  </>
                                )}
                                {/* Auto-skills: always-on system skills, shown as a non-interactive note only */}
                                {autoSkills.length > 0 && (
                                  <span
                                    className='text-10px px-7px py-2px rd-[100px] bg-fill-2 border border-border-1 text-t-tertiary'
                                    title={`系统内置（自动注入，不可管理）：${autoSkills.map((s) => s.name).join('、')}`}
                                  >
                                    系统: {autoSkills.length} 内置
                                  </span>
                                )}
                              </div>

                              {/* Col 3: Actions */}
                              <div className='flex items-center justify-end gap-6px opacity-0 group-hover:opacity-100 transition-opacity'>
                                <button
                                  type='button'
                                  className='text-11px text-primary-6 hover:text-primary-5 bg-primary-1 hover:bg-primary-2 px-10px py-5px rd-6px border border-primary-3 cursor-pointer transition-colors whitespace-nowrap outline-none'
                                  onClick={() => openConfigAssistantSkills(assistant)}
                                >
                                  {skills.length === 0
                                    ? t('settings.skillsHub.addSkill', { defaultValue: '+ 配置技能' })
                                    : t('settings.skillsHub.manageSkills', { defaultValue: '配置技能' })}
                                </button>
                                <button
                                  type='button'
                                  className='text-11px text-t-secondary hover:text-t-primary bg-fill-2 hover:bg-fill-3 px-10px py-5px rd-6px border border-border-1 cursor-pointer transition-colors whitespace-nowrap outline-none'
                                  onClick={() => openAssistantEditor(assistant)}
                                >
                                  {t('settings.skillsHub.editAssistant', { defaultValue: '编辑' })}
                                </button>
                              </div>
                            </div>
                          ))}

                          {/* AGENT 默认调用 section */}
                          {groupedByAssistantData.unassignedSkills.length > 0 && (
                            <div className='mt-16px pt-16px border-t border-border-1'>
                              <div className='flex items-center gap-8px px-12px mb-4px'>
                                <span className='text-12px font-semibold text-t-primary'>
                                  {t('settings.skillsHub.sectionAgentDefault', { defaultValue: 'AGENT 默认调用' })}
                                </span>
                                <span className='text-11px px-7px py-1px rd-[100px] bg-fill-3 text-t-tertiary font-medium'>
                                  {groupedByAssistantData.unassignedSkills.length}
                                </span>
                              </div>
                              <p className='text-11px text-t-tertiary px-12px mb-10px m-0 leading-relaxed'>
                                {t('settings.skillsHub.agentDefaultDesc', {
                                  defaultValue: '未指定给任何助手，可被 AGENT 在执行过程中按需调用。点击可分配给特定助手。',
                                })}
                              </p>
                              <div className='flex flex-wrap gap-6px px-12px'>
                                {groupedByAssistantData.unassignedSkills.map((skill) => (
                                  <button
                                    key={skill.name}
                                    data-testid={`my-skill-row-${skill.name}`}
                                    type='button'
                                    className='group/chip flex items-center gap-6px text-12px px-10px py-5px rd-[100px] bg-fill-2 border border-border-1 text-t-secondary hover:bg-primary-1 hover:text-primary-6 hover:border-primary-4 transition-colors cursor-pointer outline-none'
                                    onClick={() => openAssignModal(skill)}
                                    title={skill.description}
                                  >
                                    <div
                                      className={`w-16px h-16px shrink-0 rd-4px flex items-center justify-center font-bold text-9px text-transform-uppercase ${getAvatarColorClass(skill.name)}`}
                                    >
                                      {skill.name.charAt(0).toUpperCase()}
                                    </div>
                                    {skill.name}
                                    <span className='text-10px text-t-tertiary group-hover/chip:text-primary-5'>+ 分配</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className='text-center text-t-secondary text-13px py-40px bg-fill-1 rd-12px border border-b-base border-dashed relative z-10'>
                  {loading
                    ? t('common.loading', { defaultValue: 'Please wait...' })
                    : t('settings.skillsHub.noSkills', {
                        defaultValue: 'No skills found. Import some to get started.',
                      })}
                </div>
              )}
            </div>
            )}

            {/* ======== Usage Tip ======== */}
            {activeMainTab === 'library' && (
            <div className='px-16px md:px-[24px] py-20px bg-base border border-b-base shadow-sm rd-16px flex items-start gap-12px text-t-secondary'>
              <Info size={18} className='text-primary-6 mt-2px shrink-0' />
              <div className='flex flex-col gap-4px'>
                <span className='font-bold text-t-primary text-14px'>
                  {t('settings.skillsHub.tipTitle', { defaultValue: 'Usage Tip:' })}
                </span>
                <span className='text-13px leading-relaxed'>{t('settings.skillsHub.tipContent')}</span>
              </div>
            </div>
            )}
            </div>
          </div>
        </div>
      </SettingsPageWrapper>

      <Modal
        title={
          externalPreviewSkill
            ? t('settings.skillsHub.externalPreviewTitle', {
                name: externalPreviewSkill.name,
                defaultValue: `View external skill: ${externalPreviewSkill.name}`,
              })
            : ''
        }
        visible={Boolean(externalPreviewSkill)}
        onCancel={() => setExternalPreviewSkill(null)}
        footer={
          <div className='flex flex-wrap justify-end gap-8px'>
            <Button onClick={() => setExternalPreviewSkill(null)}>
              {t('common.close', { defaultValue: 'Close' })}
            </Button>
            {externalPreviewSkill ? (
              <>
                <Button onClick={() => void handleOpenExternalSkillFolder(externalPreviewSkill)}>
                  {t('settings.skillsHub.openSkillFolder', { defaultValue: 'Open folder in Explorer' })}
                </Button>
                <Button
                  type='primary'
                  disabled={externalPreviewStatus === 'builtin'}
                  title={
                    externalPreviewStatus === 'builtin'
                      ? t('settings.skillsHub.externalSkillImportBlocked', {
                          defaultValue: 'Cannot import due to built-in skill name conflict',
                        })
                      : undefined
                  }
                  onClick={() =>
                    void handleImport(externalSkillDirectory(externalPreviewSkill), {
                      skillName: externalPreviewSkill.name,
                    })
                  }
                >
                  {t('common.import', { defaultValue: 'Import' })}
                </Button>
              </>
            ) : null}
          </div>
        }
        autoFocus={false}
        focusLock
      >
        {externalPreviewSkill ? (
          <div className='flex flex-col gap-16px'>
            <Typography.Text type='secondary' className='text-13px leading-relaxed'>
              {t('settings.skillsHub.externalPreviewHint', {
                defaultValue:
                  'Browse metadata from the source folder. Use Import to add it to My Skills; the card no longer imports on click.',
              })}
            </Typography.Text>
            <div>
              <div className='text-12px font-medium text-t-secondary mb-6px'>
                {t('settings.skillsHub.externalPreviewPath', { defaultValue: 'Source path' })}
              </div>
              <Typography.Paragraph
                className='text-13px font-mono text-t-primary mb-0 break-all bg-fill-1 px-12px py-8px rd-8px border border-border-1'
                copyable
              >
                {externalSkillDirectory(externalPreviewSkill)}
              </Typography.Paragraph>
            </div>
            <div>{renderSkillMetaTags(externalPreviewSkill)}</div>
            <div className='flex flex-wrap gap-6px'>{renderExternalSkillStatusTag(externalPreviewSkill)}</div>
            {externalPreviewStatus === 'builtin' ? (
              <div className='text-12px text-orangered-6'>
                {t('settings.skillsHub.externalPreviewBuiltinConflict', {
                  defaultValue: 'This skill cannot be imported because its name conflicts with an existing built-in skill.',
                })}
              </div>
            ) : null}
            {externalPreviewSkill.description ? (
              <div>
                <div className='text-12px font-medium text-t-secondary mb-6px'>
                  {t('settings.skillsHub.externalPreviewDescription', { defaultValue: 'Description' })}
                </div>
                <Typography.Paragraph className='text-13px text-t-primary mb-0 whitespace-pre-wrap'>
                  {externalPreviewSkill.description}
                </Typography.Paragraph>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        title={
          mySkillPreview
            ? t('settings.skillsHub.mySkillPreviewTitle', {
                name: mySkillPreview.name,
                defaultValue: `My skill: ${mySkillPreview.name}`,
              })
            : ''
        }
        visible={Boolean(mySkillPreview)}
        onCancel={() => setMySkillPreview(null)}
        style={{ maxWidth: 640 }}
        footer={
          mySkillPreview ? (
            <div className='flex flex-wrap justify-end gap-8px'>
              <Button onClick={() => setMySkillPreview(null)}>
                {t('common.close', { defaultValue: 'Close' })}
              </Button>
              {externalSkillDirectory(mySkillPreview) ? (
                <Button onClick={() => void handleOpenExternalSkillFolder(mySkillPreview)}>
                  {t('settings.skillsHub.openSkillFolder', { defaultValue: 'Open folder in Explorer' })}
                </Button>
              ) : null}
              {externalSources.length > 0 && (
                <Dropdown
                  trigger='click'
                  position='tl'
                  droplist={
                    <Menu>
                      {externalSources.map((source) => (
                        <Menu.Item
                          key={source.source}
                          onClick={() => {
                            void runExportSkillToTarget(mySkillPreview, source.path);
                          }}
                        >
                          {source.name}
                        </Menu.Item>
                      ))}
                    </Menu>
                  }
                >
                  <Button type='outline'>{t('settings.skillsHub.exportTo', { defaultValue: 'Export To...' })}</Button>
                </Dropdown>
              )}
              <Button
                type='outline'
                onClick={() => {
                  const skill = mySkillPreview;
                  setMySkillPreview(null);
                  openRemoveModal(skill);
                }}
              >
                {t('settings.skillsHub.removeFromAssistants', { defaultValue: 'Remove from assistants' })}
              </Button>
              <Button
                type='primary'
                onClick={() => {
                  const skill = mySkillPreview;
                  setMySkillPreview(null);
                  openAssignModal(skill);
                }}
              >
                {t('settings.skillsHub.assignToAssistants', { defaultValue: 'Assign to assistants' })}
              </Button>
              {mySkillPreview.isCustom ? (
                <Button
                  data-testid='my-skill-preview-delete'
                  status='danger'
                  onClick={() => {
                    const skill = mySkillPreview;
                    Modal.confirm({
                      title: t('settings.skillsHub.deleteConfirmTitle', { defaultValue: 'Delete Skill' }),
                      content: t('settings.skillsHub.deleteConfirmContent', {
                        name: skill.name,
                        defaultValue: `Are you sure you want to delete "${skill.name}"?`,
                      }),
                      okButtonProps: { status: 'danger' },
                      onOk: () => void handleDelete(skill.name),
                    });
                  }}
                >
                  <span className='inline-flex items-center gap-4px'>
                    <Delete size={16} />
                    {t('common.delete', { defaultValue: 'Delete' })}
                  </span>
                </Button>
              ) : null}
            </div>
          ) : null
        }
        autoFocus={false}
        focusLock
      >
        {mySkillPreview ? (
          <div className='flex flex-col gap-16px'>
            <Typography.Text type='secondary' className='text-13px leading-relaxed'>
              {t('settings.skillsHub.mySkillPreviewHint', {
                defaultValue:
                  'Click a skill in the list to view details. Use the buttons below to assign, remove, export, or delete.',
              })}
            </Typography.Text>
            <div>
              <div className='text-12px font-medium text-t-secondary mb-6px'>
                {t('settings.skillsHub.mySkillPreviewPath', { defaultValue: 'Skill directory' })}
              </div>
              <Typography.Paragraph
                className='text-13px font-mono text-t-primary mb-0 break-all bg-fill-1 px-12px py-8px rd-8px border border-border-1'
                copyable={Boolean(externalSkillDirectory(mySkillPreview))}
              >
                {externalSkillDirectory(mySkillPreview) ||
                  t('settings.skillsHub.mySkillPreviewPathUnknown', { defaultValue: 'Path not available' })}
              </Typography.Paragraph>
            </div>
            <div>{renderSkillMetaTags(mySkillPreview)}</div>
            {renderSkillUsageSummary(mySkillPreview)}
            {mySkillPreview.description ? (
              <div>
                <div className='text-12px font-medium text-t-secondary mb-6px'>
                  {t('settings.skillsHub.externalPreviewDescription', { defaultValue: 'Description' })}
                </div>
                <Typography.Paragraph className='text-13px text-t-primary mb-0 whitespace-pre-wrap'>
                  {mySkillPreview.description}
                </Typography.Paragraph>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      {/* Configure skills for a specific assistant (by-assistant view) */}
      <Modal
        title={
          configAssistantTarget
            ? t('settings.skillsHub.configAssistantTitle', {
                name: getAssistantDisplayName(configAssistantTarget),
                defaultValue: `为「${getAssistantDisplayName(configAssistantTarget)}」配置技能`,
              })
            : ''
        }
        visible={configAssistantVisible}
        onCancel={() => setConfigAssistantVisible(false)}
        style={{ maxWidth: 520 }}
        footer={
          <div className='flex justify-end gap-8px'>
            <Button onClick={() => setConfigAssistantVisible(false)}>
              {t('common.cancel', { defaultValue: '取消' })}
            </Button>
            <Button type='primary' loading={configAssistantSaving} onClick={() => void handleSaveConfigAssistantSkills()}>
              {t('common.save', { defaultValue: '保存' })}
            </Button>
          </div>
        }
        autoFocus={false}
        focusLock
      >
        <div className='flex flex-col gap-12px'>
          <div className='relative'>
            <div className='absolute left-10px top-1/2 -translate-y-1/2 text-t-tertiary pointer-events-none'>
              <Search size={14} />
            </div>
            <input
              type='text'
              className='w-full bg-fill-1 border border-border-1 focus:border-primary-5 outline-none rd-8px py-6px pl-32px pr-12px text-13px text-t-primary placeholder:text-t-tertiary transition-all box-border m-0'
              placeholder={t('settings.skillsHub.searchPlaceholder', { defaultValue: '搜索技能...' })}
              value={configAssistantSearch}
              onChange={(e) => setConfigAssistantSearch(e.target.value)}
            />
          </div>
          <div className='max-h-[360px] overflow-y-auto flex flex-col gap-2px custom-scrollbar'>
            {availableSkills
              .filter((s) => {
                const q = configAssistantSearch.toLowerCase();
                return !q || s.name.toLowerCase().includes(q) || (s.description?.toLowerCase().includes(q) ?? false);
              })
              .map((skill) => {
                const checked = configAssistantSkillIds.includes(skill.name);
                return (
                  <div
                    key={skill.name}
                    className={`flex items-center gap-12px px-12px py-10px rd-8px cursor-pointer transition-all hover:bg-fill-1 ${checked ? 'bg-primary-1 hover:bg-primary-1' : ''}`}
                    onClick={() => {
                      setConfigAssistantSkillIds((prev) =>
                        checked ? prev.filter((n) => n !== skill.name) : [...prev, skill.name]
                      );
                    }}
                  >
                    <Checkbox checked={checked} onChange={() => {}} />
                    <div className='flex flex-col min-w-0 flex-1'>
                      <div className='flex items-center gap-8px'>
                        <span className='text-13px font-medium text-t-primary truncate'>{skill.name}</span>
                        {skill.isCustom ? (
                          <span className='text-10px px-5px rd-4px bg-[rgba(var(--orange-6),0.08)] text-orange-6 border border-[rgba(var(--orange-6),0.2)]'>
                            {t('settings.skillsHub.installed', { defaultValue: '已安装' })}
                          </span>
                        ) : (
                          <span className='text-10px px-5px rd-4px bg-[rgba(var(--blue-6),0.08)] text-blue-6 border border-[rgba(var(--blue-6),0.2)]'>
                            {t('settings.skillsHub.official', { defaultValue: '官方' })}
                          </span>
                        )}
                      </div>
                      {skill.description && (
                        <p className='text-11px text-t-tertiary m-0 line-clamp-1'>{skill.description}</p>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
          <div className='text-11px text-t-tertiary'>
            {t('settings.skillsHub.configAssistantSelected', {
              count: configAssistantSkillIds.length,
              defaultValue: `已选择 ${configAssistantSkillIds.length} 个技能`,
            })}
          </div>
        </div>
      </Modal>

      {/* Add Custom External Path Modal */}
      <Modal
        title={t('settings.skillsHub.addCustomPath', { defaultValue: 'Add Custom Skill Path' })}
        visible={showAddPathModal}
        onCancel={() => {
          setShowAddPathModal(false);
          setCustomPathName('');
          setCustomPathValue('');
        }}
        onOk={() => void handleAddCustomPath()}
        okText={t('common.confirm', { defaultValue: 'Confirm' })}
        cancelText={t('common.cancel', { defaultValue: 'Cancel' })}
        okButtonProps={{ disabled: !customPathName.trim() || !customPathValue.trim() }}
        autoFocus={false}
        focusLock
      >
        <div className='flex flex-col gap-16px'>
          <div>
            <div className='text-13px font-medium text-t-primary mb-8px'>
              {t('common.name', { defaultValue: 'Name' })}
            </div>
            <Input
              placeholder={t('settings.skillsHub.customPathNamePlaceholder', { defaultValue: 'e.g. My Custom Skills' })}
              value={customPathName}
              onChange={(v) => setCustomPathName(v)}
              className='rd-6px'
            />
          </div>
          <div>
            <div className='text-13px font-medium text-t-primary mb-8px'>
              {t('settings.skillsHub.customPathLabel', { defaultValue: 'Skill Directory Path' })}
            </div>
            <div className='flex gap-8px'>
              <Input
                placeholder={t('settings.skillsHub.customPathPlaceholder', {
                  defaultValue: 'e.g. C:\\Users\\me\\.mytools\\skills',
                })}
                value={customPathValue}
                onChange={(v) => setCustomPathValue(v)}
                className='flex-1 rd-6px'
              />
              <Button
                className='rd-6px'
                onClick={async () => {
                  try {
                    const result = await ipcBridge.dialog.showOpen.invoke({ properties: ['openDirectory'] });
                    if (result && result.length > 0) {
                      setCustomPathValue(result[0]);
                    }
                  } catch (e) {
                    console.error('Failed to select directory', e);
                  }
                }}
              >
                <FolderOpen size={16} />
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        title={
          selectedSkill
            ? t('settings.skillsHub.assignModalTitle', {
                name: selectedSkill.name,
                defaultValue: `Assign "${selectedSkill.name}"`,
              })
            : t('settings.skillsHub.assignToAssistants', { defaultValue: 'Assign to assistants' })
        }
        visible={assignModalVisible}
        onCancel={() => {
          setAssignModalVisible(false);
          setSelectedSkill(null);
          setSelectedAssistantIds([]);
        }}
        onOk={() => void handleSaveAssignments()}
        confirmLoading={assigning}
        okText={t('common.save', { defaultValue: 'Save' })}
        cancelText={t('common.cancel', { defaultValue: 'Cancel' })}
        autoFocus={false}
        focusLock
      >
        <div className='flex flex-col gap-12px max-h-[420px] overflow-y-auto pr-4px'>
          {selectedSkill && (
            <div className='text-13px text-t-secondary'>
              {t('settings.skillsHub.assignModalDescription', {
                defaultValue: 'Choose which assistants should use this skill.',
              })}
            </div>
          )}
          {assistants.length > 0 ? (
            assistants.map((assistant) => {
              const checked = selectedAssistantIds.includes(assistant.id);
              return (
                <label
                  key={assistant.id}
                  className='flex items-start gap-10px p-12px rd-10px border border-border-1 hover:bg-fill-1 cursor-pointer'
                >
                  <Checkbox
                    checked={checked}
                    onChange={(value) => {
                      setSelectedAssistantIds((prev) =>
                        value ? [...prev, assistant.id] : prev.filter((assistantId) => assistantId !== assistant.id)
                      );
                    }}
                  />
                  <div className='flex-1 min-w-0'>
                    <div className='flex flex-wrap items-center gap-8px'>
                      <span className='text-14px text-t-primary font-medium'>{getAssistantDisplayName(assistant)}</span>
                      <Tag size='small' color='arcoblue'>
                        {getAgentLabel(assistant.presetAgentType)}
                      </Tag>
                      {assistant.isPreset === false && (
                        <Tag size='small' color='orangered'>
                          {t('settings.assistantFilterCustom', { defaultValue: 'Custom' })}
                        </Tag>
                      )}
                      {assistant.enabled === false && (
                        <Tag size='small' color='gray'>
                          {t('settings.assistantSectionDisabled', { defaultValue: 'Disabled' })}
                        </Tag>
                      )}
                    </div>
                    {assistant.description && (
                      <div className='text-12px text-t-secondary mt-4px line-clamp-2'>
                        {assistant.descriptionI18n?.[localeKey] || assistant.description}
                      </div>
                    )}
                  </div>
                </label>
              );
            })
          ) : (
            <div className='text-13px text-t-secondary'>
              {t('settings.skillsHub.noAssistantsToAssign', {
                defaultValue: 'No assistants available to assign.',
              })}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        title={t('settings.skillsHub.replaceModalTitle', { defaultValue: 'Batch replace skill' })}
        visible={replaceModalVisible}
        onCancel={() => {
          setReplaceModalVisible(false);
          setReplaceFromSkill('');
          setReplaceToSkill('');
          setReplaceAssistantIds([]);
        }}
        onOk={() => void handleSaveBatchReplace()}
        confirmLoading={replaceSaving}
        okText={t('common.save', { defaultValue: 'Save' })}
        cancelText={t('common.cancel', { defaultValue: 'Cancel' })}
        autoFocus={false}
        focusLock
      >
        <div className='flex flex-col gap-16px'>
          <div className='text-13px text-t-secondary'>
            {t('settings.skillsHub.replaceModalDescription', {
              defaultValue:
                'Replace a skill with another on selected assistants (built-in and custom). Only assistants that currently enable the source skill are updated.',
            })}
          </div>
          <div>
            <div className='text-13px font-medium text-t-primary mb-8px'>
              {t('settings.skillsHub.replaceFromLabel', { defaultValue: 'Source skill' })}
            </div>
            <Select
              showSearch
              allowClear
              placeholder={t('settings.skillsHub.replaceFromPlaceholder', { defaultValue: 'Select source skill' })}
              options={skillSelectOptions}
              value={replaceFromSkill || undefined}
              onChange={(value) => {
                const next = typeof value === 'string' ? value : '';
                setReplaceFromSkill(next);
                syncReplaceAssistantSelection(next);
              }}
              className='w-full'
            />
          </div>
          <div>
            <div className='text-13px font-medium text-t-primary mb-8px'>
              {t('settings.skillsHub.replaceToLabel', { defaultValue: 'Target skill' })}
            </div>
            <Select
              showSearch
              allowClear
              placeholder={t('settings.skillsHub.replaceToPlaceholder', { defaultValue: 'Select target skill' })}
              options={skillSelectOptions}
              value={replaceToSkill || undefined}
              onChange={(value) => setReplaceToSkill(typeof value === 'string' ? value : '')}
              className='w-full'
            />
          </div>
          <div className='text-12px text-t-tertiary'>
            {t('settings.skillsHub.replaceAssistantsHint', {
              defaultValue:
                'Assistants below are pre-selected from those using the source skill. Uncheck to skip an assistant.',
            })}
          </div>
          <div className='flex flex-col gap-10px max-h-[320px] overflow-y-auto pr-4px'>
            {assistants.length > 0 ? (
              assistants.map((assistant) => {
                const hasFrom = replaceFromSkill.trim() && assistant.enabledSkills?.includes(replaceFromSkill);
                const checked = replaceAssistantIds.includes(assistant.id);
                return (
                  <label
                    key={`replace-${assistant.id}`}
                    className={`flex items-start gap-10px p-12px rd-10px border border-border-1 ${hasFrom ? 'hover:bg-fill-1 cursor-pointer' : 'opacity-60'}`}
                  >
                    <Checkbox
                      disabled={!hasFrom}
                      checked={checked}
                      onChange={(value) => {
                        setReplaceAssistantIds((prev) =>
                          value ? [...prev, assistant.id] : prev.filter((assistantId) => assistantId !== assistant.id)
                        );
                      }}
                    />
                    <div className='flex-1 min-w-0'>
                      <div className='flex flex-wrap items-center gap-8px'>
                        <span className='text-14px text-t-primary font-medium'>
                          {getAssistantDisplayName(assistant)}
                        </span>
                        <Tag size='small' color='arcoblue'>
                          {getAgentLabel(assistant.presetAgentType)}
                        </Tag>
                        {assistant.isPreset === false && (
                          <Tag size='small' color='orangered'>
                            {t('settings.assistantFilterCustom', { defaultValue: 'Custom' })}
                          </Tag>
                        )}
                        {!hasFrom && replaceFromSkill.trim() && (
                          <Tag size='small' color='gray'>
                            {t('settings.skillsHub.replaceNoSourceOnAssistant', {
                              defaultValue: 'Does not use source',
                            })}
                          </Tag>
                        )}
                      </div>
                    </div>
                  </label>
                );
              })
            ) : (
              <div className='text-13px text-t-secondary'>
                {t('settings.skillsHub.noAssistantsToAssign', {
                  defaultValue: 'No assistants available to assign.',
                })}
              </div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        title={
          removeTargetSkill
            ? t('settings.skillsHub.removeModalTitle', {
                name: removeTargetSkill.name,
                defaultValue: `Remove "${removeTargetSkill.name}" from assistants`,
              })
            : t('settings.skillsHub.removeFromAssistants', { defaultValue: 'Remove from assistants' })
        }
        visible={removeModalVisible}
        onCancel={() => {
          setRemoveModalVisible(false);
          setRemoveTargetSkill(null);
          setRemoveAssistantIds([]);
        }}
        onOk={() => void handleSaveRemoveFromAssistants()}
        confirmLoading={removeSaving}
        okText={t('settings.skillsHub.removeConfirmOk', { defaultValue: 'Remove' })}
        cancelText={t('common.cancel', { defaultValue: 'Cancel' })}
        okButtonProps={{ status: 'danger' }}
        autoFocus={false}
        focusLock
      >
        <div className='flex flex-col gap-12px max-h-[420px] overflow-y-auto pr-4px'>
          {removeTargetSkill && (
            <div className='text-13px text-t-secondary'>
              {t('settings.skillsHub.removeModalDescription', {
                defaultValue:
                  'Uncheck an assistant to keep this skill enabled for them. Checked assistants will lose the skill after you confirm.',
              })}
            </div>
          )}
          {removeTargetSkill ? (
            assistants.filter((assistant) => assistant.enabledSkills?.includes(removeTargetSkill.name)).length > 0 ? (
              assistants
                .filter((assistant) => assistant.enabledSkills?.includes(removeTargetSkill.name))
                .map((assistant) => {
                  const checked = removeAssistantIds.includes(assistant.id);
                  return (
                    <label
                      key={`remove-${assistant.id}`}
                      className='flex items-start gap-10px p-12px rd-10px border border-border-1 hover:bg-fill-1 cursor-pointer'
                    >
                      <Checkbox
                        checked={checked}
                        onChange={(value) => {
                          setRemoveAssistantIds((prev) =>
                            value
                              ? Array.from(new Set([...prev, assistant.id]))
                              : prev.filter((assistantId) => assistantId !== assistant.id)
                          );
                        }}
                      />
                      <div className='flex-1 min-w-0'>
                        <div className='flex flex-wrap items-center gap-8px'>
                          <span className='text-14px text-t-primary font-medium'>
                            {getAssistantDisplayName(assistant)}
                          </span>
                          <Tag size='small' color='arcoblue'>
                            {getAgentLabel(assistant.presetAgentType)}
                          </Tag>
                          {assistant.isPreset === false && (
                            <Tag size='small' color='orangered'>
                              {t('settings.assistantFilterCustom', { defaultValue: 'Custom' })}
                            </Tag>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })
            ) : (
              <div className='text-13px text-t-secondary'>
                {t('settings.skillsHub.removeNoUsers', {
                  defaultValue: 'No assistant currently uses this skill.',
                })}
              </div>
            )
          ) : null}
        </div>
      </Modal>
    </>
  );
};

export default SkillsHubSettings;
