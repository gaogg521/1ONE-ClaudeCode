import { ipcBridge } from '@/common';
import { ConfigStorage } from '@/common/config/storage';
import { resolveLocaleKey } from '@/common/utils';
import type { AcpBackendConfig } from '@/common/types/acpTypes';
import type { ExternalSkillSource, SkillMetadata, SkillPlatform } from '@/common/types/skillMetadata';
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
import { Delete, FolderOpen, Info, More, Search, Plus, Refresh } from '@icon-park/react';
import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import SettingsPageWrapper from './components/SettingsPageWrapper';

/** Agent filter: skills used by at least one user-created (non-preset) assistant */
const CUSTOM_ASSISTANT_AGENT_FILTER = '__custom_assistant__';

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
  const [loading, setLoading] = useState(false);
  const [availableSkills, setAvailableSkills] = useState<SkillMetadata[]>([]);
  const [assistants, setAssistants] = useState<AcpBackendConfig[]>([]);
  const [skillPaths, setSkillPaths] = useState<{ userSkillsDir: string; builtinSkillsDir: string } | null>(null);
  const [externalSources, setExternalSources] = useState<ExternalSkillSource[]>([]);
  const [activeSourceTab, setActiveSourceTab] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchExternalQuery, setSearchExternalQuery] = useState('');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [assistantFilterIds, setAssistantFilterIds] = useState<string[]>([]);
  const [unassignedMode, setUnassignedMode] = useState<'global' | 'selected-assistants'>('global');
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
  const [skillListLayout, setSkillListLayout] = useState<'flat' | 'by-assistant'>('flat');
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

  const getPlatformLabel = useCallback(
    (platform: SkillPlatform) => {
      switch (platform) {
        case '1one':
          return '1ONE';
        case 'claude':
          return 'Claude';
        case 'openclaw':
          return 'OpenClaw';
        case 'cursor':
          return 'Cursor';
        default:
          return t('settings.skillsHub.genericLayer', { defaultValue: 'Generic' });
      }
    },
    [t]
  );

  const renderSkillMetaTags = useCallback(
    (skill: SkillMetadata) => {
      const platforms = Array.isArray(skill.platforms) ? skill.platforms : [];
      return (
        <div className='flex flex-wrap items-center gap-6px'>
          {platforms.map((platform) => (
            <Tag key={`${skill.name}-${platform}`} size='small'>
              {getPlatformLabel(platform)}
            </Tag>
          ))}
          {!skill.effective && skill.shadowedBy && (
            <Tag size='small' color='orangered'>
              {t('settings.skillsHub.shadowed', {
                defaultValue: 'Shadowed by {{name}}',
                name: skill.shadowedBy.byName,
              })}
            </Tag>
          )}
        </div>
      );
    },
    [getPlatformLabel, t]
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

  const skillAgentFilters = useMemo(
    () =>
      Array.from(
        new Set(
          assistants
            .map((assistant) => assistant.presetAgentType)
            .filter((agentType): agentType is string => typeof agentType === 'string' && agentType.length > 0)
        )
      ),
    [assistants]
  );

  const agentTypeInfo = useMemo(() => {
    const map = new Map<string, { count: number; names: string[] }>();
    for (const a of assistants) {
      const type = a.presetAgentType;
      if (!type || typeof type !== 'string') continue;
      const current = map.get(type) ?? { count: 0, names: [] };
      current.count += 1;
      current.names.push(getAssistantDisplayName(a));
      map.set(type, current);
    }
    return map;
  }, [assistants, getAssistantDisplayName]);

  const hasNonPresetAssistants = useMemo(() => assistants.some((assistant) => assistant.isPreset === false), [
    assistants,
  ]);

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
      if (agentFilter === 'all') {
        if (assistantFilterIds.length > 0) {
          return Boolean(usage?.usedByAssistants.some((a) => assistantFilterIds.includes(a.id)));
        }
        return true;
      }
      if (agentFilter === 'unassigned') {
        if (unassignedMode === 'selected-assistants' && assistantFilterIds.length > 0) {
          // Reverse lookup: show skills that are NOT enabled by any of the selected assistants.
          return !usage || !usage.usedByAssistants.some((a) => assistantFilterIds.includes(a.id));
        }
        // Default: globally unassigned (no assistants use it)
        return !usage || usage.usedByAssistants.length === 0;
      }
      if (agentFilter === CUSTOM_ASSISTANT_AGENT_FILTER) {
        if (assistantFilterIds.length > 0) {
          return Boolean(usage?.usedByAssistants.some((a) => assistantFilterIds.includes(a.id)));
        }
        return Boolean(usage?.usedByAssistants.some((assistant) => assistant.isPreset === false));
      }
      const matchesAgentType = Boolean(usage?.agentTypes.includes(agentFilter));
      if (!matchesAgentType) return false;
      if (assistantFilterIds.length > 0) {
        return Boolean(usage?.usedByAssistants.some((a) => assistantFilterIds.includes(a.id)));
      }
      return true;
    });
  }, [agentFilter, assistantFilterIds, availableSkills, searchQuery, skillUsageMap, unassignedMode]);

  const assistantsForSelectedAgentType = useMemo(() => {
    if (agentFilter === 'all') return [];
    if (agentFilter === CUSTOM_ASSISTANT_AGENT_FILTER) {
      return assistants.filter((a) => a.isPreset === false);
    }
    if (agentFilter === 'unassigned') {
      return assistants;
    }
    return assistants.filter((a) => a.presetAgentType === agentFilter);
  }, [agentFilter, assistants]);

  const assistantsForSelectedAgentTypeOptions = useMemo(
    () =>
      assistantsForSelectedAgentType.map((a) => ({
        value: a.id,
        label: `${getAssistantDisplayName(a)} (${a.id})`,
      })),
    [assistantsForSelectedAgentType, getAssistantDisplayName]
  );

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

  const groupedAssistantSections = useMemo(() => {
    const assistantsForGroups =
      agentFilter === 'all' || agentFilter === 'unassigned'
        ? assistants
        : agentFilter === CUSTOM_ASSISTANT_AGENT_FILTER
          ? assistants.filter((assistant) => assistant.isPreset === false)
          : assistants.filter((assistant) => assistant.presetAgentType === agentFilter);
    const sections = assistantsForGroups
      .map((assistant) => ({
        assistant,
        skills: displaySkills.filter((skill) =>
          skillUsageMap.get(skill.name)?.usedByAssistants.some((x) => x.id === assistant.id)
        ),
      }))
      .filter((section) => section.skills.length > 0)
      .toSorted((a, b) =>
        getAssistantDisplayName(a.assistant).localeCompare(getAssistantDisplayName(b.assistant), undefined, {
          sensitivity: 'base',
        })
      );
    const unassignedSkills = displaySkills.filter((skill) => {
      const usage = skillUsageMap.get(skill.name);
      return !usage || usage.usedByAssistants.length === 0;
    });
    return { sections, unassignedSkills };
  }, [agentFilter, assistants, displaySkills, getAssistantDisplayName, skillUsageMap]);

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
      const [skills, agentConfigs] = await Promise.all([
        ipcBridge.fs.listAvailableSkills.invoke(),
        ConfigStorage.get('acp.customAgents'),
      ]);
      setAvailableSkills(skills);
      setAssistants(
        ((agentConfigs || []) as AcpBackendConfig[]).filter((assistant) => typeof assistant.id === 'string' && assistant.id.length > 0)
      );

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

      const jumpToAssistant = (assistantId: string) => {
        const assistant = assistants.find((a) => a.id === assistantId);
        if (!assistant) return;
        const nextAgentFilter =
          assistant.isPreset === false ? CUSTOM_ASSISTANT_AGENT_FILTER : (assistant.presetAgentType ?? 'all');
        setAgentFilter(nextAgentFilter);
        setAssistantFilterIds([assistant.id]);
      };

      return (
        <div className='flex flex-col gap-6px'>
          <div className='flex flex-wrap items-center gap-6px'>
            <Tag size='small' color={usage.usedByAssistants.length > 0 ? 'green' : 'gray'}>
              {t('settings.skillsHub.usedByAssistantsCount', {
                count: usage.usedByAssistants.length,
                defaultValue:
                  usage.usedByAssistants.length > 1
                    ? `Used by ${usage.usedByAssistants.length} assistants`
                    : usage.usedByAssistants.length === 1
                      ? 'Used by 1 assistant'
                      : 'Not assigned',
              })}
            </Tag>
            {usage.agentTypes.map((agentType) => (
              <Tag key={`${skill.name}-${agentType}-usage`} size='small' color='arcoblue'>
                {getAgentLabel(agentType)}
              </Tag>
            ))}
          </div>
          {usage.usedByAssistants.length > 0 && (
            <div className='flex flex-wrap gap-6px'>
              {usage.usedByAssistants.slice(0, 6).map((assistant) => (
                <button
                  key={`${skill.name}-${assistant.id}`}
                  type='button'
                  className='text-12px text-t-secondary px-8px py-3px rd-[100px] bg-fill-1 border border-border-1 cursor-pointer hover:bg-fill-2 hover:border-border-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary-5'
                  onClick={(e) => {
                    e.stopPropagation();
                    jumpToAssistant(assistant.id);
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
    [assistants, getAgentLabel, getAssistantDisplayName, skillUsageMap, t]
  );

  const renderMySkillRow = (skill: SkillMetadata) => (
    <div
      key={skill.name}
      className='group flex flex-row gap-12px p-16px bg-base border border-transparent hover:border-border-1 hover:bg-fill-1 hover:shadow-sm rd-12px transition-all duration-200'
    >
      <div
        data-testid={`my-skill-row-${skill.name}`}
        role='button'
        tabIndex={0}
        className='flex flex-1 min-w-0 flex-col sm:flex-row gap-16px cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-5 rd-8px'
        onClick={() => setMySkillPreview(skill)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setMySkillPreview(skill);
          }
        }}
      >
        <div className='shrink-0 flex items-start sm:mt-2px'>
          <div
            className={`w-40px h-40px rd-10px flex items-center justify-center font-bold text-16px shadow-sm text-transform-uppercase ${getAvatarColorClass(skill.name)}`}
          >
            {skill.name.charAt(0).toUpperCase()}
          </div>
        </div>

        <div className='flex-1 min-w-0 flex flex-col justify-center gap-6px'>
          <div className='flex items-center gap-10px flex-wrap'>
            <h3 className='text-14px font-semibold text-t-primary/90 truncate m-0'>{skill.name}</h3>
            {skill.isCustom ? (
              <span className='bg-[rgba(var(--orange-6),0.08)] text-orange-6 border border-[rgba(var(--orange-6),0.2)] text-11px px-6px py-1px rd-4px font-medium'>
                {t('settings.skillsHub.custom', { defaultValue: 'Custom' })}
              </span>
            ) : (
              <span className='bg-[rgba(var(--blue-6),0.08)] text-blue-6 border border-[rgba(var(--blue-6),0.2)] text-11px px-6px py-1px rd-4px font-medium'>
                {t('settings.skillsHub.builtin', { defaultValue: 'Built-in' })}
              </span>
            )}
          </div>
          {renderSkillMetaTags(skill)}
          {renderSkillUsageSummary(skill)}
          {skill.description && (
            <p className='text-13px text-t-secondary leading-relaxed line-clamp-2 m-0' title={skill.description}>
              {skill.description}
            </p>
          )}
        </div>
      </div>

      <div
        className='shrink-0 flex items-start sm:items-center pt-4px sm:pt-0 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity'
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
            className='p-8px hover:bg-fill-2 text-t-tertiary hover:text-t-primary rd-8px outline-none border border-transparent cursor-pointer transition-colors bg-base flex items-center justify-center'
            title={t('settings.skillsHub.mySkillQuickActions', { defaultValue: 'Quick actions' })}
            aria-label={t('settings.skillsHub.mySkillQuickActions', { defaultValue: 'Quick actions' })}
            data-testid={`my-skill-quick-${skill.name}`}
          >
            <More theme='outline' size={18} />
          </button>
        </Dropdown>
      </div>
    </div>
  );

  const totalExternal = externalSources.reduce((sum, src) => sum + src.skills.length, 0);
  const activeSource = externalSources.find((s) => s.source === activeSourceTab);

  const filteredExternalSkills = useMemo(() => {
    if (!activeSource) return [];
    if (!searchExternalQuery.trim()) return activeSource.skills;
    const lowerQuery = searchExternalQuery.toLowerCase();
    return activeSource.skills.filter(
      (s) =>
        s.name.toLowerCase().includes(lowerQuery) || (s.description && s.description.toLowerCase().includes(lowerQuery))
    );
  }, [activeSource, searchExternalQuery]);

  return (
    <>
      <SettingsPageWrapper>
        <div className='flex flex-col h-full w-full'>
          <div className='space-y-16px pb-24px'>
            {/* ======== 发现外部技能 / Discovered External Skills ======== */}
            {totalExternal > 0 && (
              <div className='px-[16px] md:px-[32px] py-32px bg-base rd-16px md:rd-24px mb-16px shadow-sm border border-b-base relative overflow-hidden transition-all'>
                {/* Section Header with Search Bar */}
                <div className='flex flex-col lg:flex-row lg:items-start justify-between gap-16px mb-24px relative z-10 w-full'>
                  <div className='flex flex-col'>
                    <div className='flex items-center gap-10px mb-8px'>
                      <span className='text-16px md:text-18px text-t-primary font-bold tracking-tight'>
                        {t('settings.skillsHub.discoveredTitle', { defaultValue: 'Discovered External Skills' })}
                      </span>
                      <span className='bg-[rgba(var(--primary-6),0.08)] text-primary-6 text-12px px-10px py-2px rd-[100px] font-medium ml-4px'>
                        {totalExternal}
                      </span>
                      <button
                        className='outline-none border-none bg-transparent cursor-pointer p-6px text-t-tertiary hover:text-primary-6 transition-colors rd-full hover:bg-fill-2 ml-4px'
                        onClick={() => void handleRefreshExternal()}
                        title={t('common.refresh', { defaultValue: 'Refresh' })}
                      >
                        <Refresh theme='outline' size={16} className={refreshing ? 'animate-spin' : ''} />
                      </button>
                    </div>
                    <Typography.Text className='text-13px text-t-secondary block max-w-xl leading-relaxed'>
                      {t('settings.skillsHub.discoveryAlert', {
                        defaultValue: 'Detected skills from your CLI tools. Import them to use in 1ONE ClaudeCode.',
                      })}
                    </Typography.Text>
                  </div>

                  {/* Search Bar Outputted inline with Header description in desktop */}
                  <div className='relative group shrink-0 w-full lg:w-[240px]'>
                    <div className='absolute left-12px top-1/2 -translate-y-1/2 text-t-tertiary group-focus-within:text-primary-6 flex pointer-events-none transition-colors'>
                      <Search size={15} />
                    </div>
                    <input
                      type='text'
                      className='w-full bg-fill-1 hover:bg-fill-2 border border-border-1 focus:border-primary-5 focus:bg-base outline-none rd-8px py-6px pl-36px pr-12px text-13px text-t-primary placeholder:text-t-tertiary transition-all shadow-sm box-border m-0'
                      placeholder={t('settings.skillsHub.searchPlaceholder', { defaultValue: 'Search skills...' })}
                      value={searchExternalQuery}
                      onChange={(e) => setSearchExternalQuery(e.target.value)}
                    />
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

            {/* ======== 我的技能 / My Skills ======== */}
            <div className='px-[16px] md:px-[32px] py-32px bg-base rd-16px md:rd-24px shadow-sm border border-b-base relative overflow-hidden transition-all'>
              {/* Toolbar for My Skills */}
              <div className='flex flex-col lg:flex-row lg:items-center justify-between gap-16px mb-24px relative z-10'>
                <div className='flex items-center gap-10px shrink-0'>
                  <span className='text-16px md:text-18px text-t-primary font-bold tracking-tight'>
                    {t('settings.skillsHub.mySkillsTitle', { defaultValue: 'My Skills' })}
                  </span>
                  <span className='bg-[rgba(var(--primary-6),0.08)] text-primary-6 text-12px px-10px py-2px rd-[100px] font-medium ml-4px'>
                    {availableSkills.length}
                  </span>
                  <button
                    className='outline-none border-none bg-transparent cursor-pointer p-6px text-t-tertiary hover:text-primary-6 transition-colors rd-full hover:bg-fill-2 ml-4px'
                    onClick={async () => {
                      await fetchData();
                      Message.success(t('common.refreshSuccess', { defaultValue: 'Refreshed' }));
                    }}
                    title={t('common.refresh', { defaultValue: 'Refresh' })}
                  >
                    <Refresh theme='outline' size={16} className={loading ? 'animate-spin' : ''} />
                  </button>
                </div>

                <div className='flex flex-col sm:flex-row items-stretch sm:items-center gap-12px w-full lg:w-auto shrink-0'>
                  <div className='relative group shrink-0 w-full sm:w-[200px] lg:w-[240px]'>
                    <div className='absolute left-12px top-1/2 -translate-y-1/2 text-t-tertiary group-focus-within:text-primary-6 flex pointer-events-none transition-colors'>
                      <Search size={15} />
                    </div>
                    <input
                      type='text'
                      className='w-full bg-fill-1 hover:bg-fill-2 border border-border-1 focus:border-primary-5 focus:bg-base outline-none rd-8px py-6px pl-36px pr-12px text-13px text-t-primary placeholder:text-t-tertiary transition-all shadow-sm box-border m-0'
                      placeholder={t('settings.skillsHub.searchPlaceholder', { defaultValue: 'Search skills...' })}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>

                  <button
                    className='flex items-center justify-center gap-6px px-16px py-6px bg-base border border-border-1 hover:border-border-2 hover:bg-fill-1 text-t-primary rd-8px shadow-sm transition-all focus:outline-none shrink-0 cursor-pointer whitespace-nowrap'
                    onClick={handleManualImport}
                  >
                    <FolderOpen size={15} className='text-t-secondary' />
                    <span className='text-13px font-medium'>
                      {t('settings.skillsHub.manualImport', { defaultValue: 'Import from Folder' })}
                    </span>
                  </button>
                </div>
              </div>

              <div className='flex flex-wrap items-center gap-8px mb-16px'>
                <Button
                  size='small'
                  type={agentFilter === 'all' ? 'primary' : 'outline'}
                  className='rounded-[100px]'
                  onClick={() => {
                    setAgentFilter('all');
                    setAssistantFilterIds([]);
                    setUnassignedMode('global');
                  }}
                >
                  {t('settings.skillsHub.filterAllAgents', { defaultValue: 'All Agents' })}
                </Button>
                <Button
                  size='small'
                  type={agentFilter === 'unassigned' ? 'primary' : 'outline'}
                  className='rounded-[100px]'
                  onClick={() => {
                    setAgentFilter('unassigned');
                    setAssistantFilterIds([]);
                    setUnassignedMode('global');
                  }}
                >
                  {t('settings.skillsHub.filterUnassigned', { defaultValue: 'Unassigned' })}
                </Button>
                {skillAgentFilters.map((agentType) => (
                  <Tooltip
                    key={`agent-filter-${agentType}`}
                    content={() => {
                      const info = agentTypeInfo.get(agentType);
                      if (!info) return null;
                      const uniqueNames = Array.from(new Set(info.names));
                      return (
                        <div className='max-w-[360px]'>
                          <div className='font-medium mb-6px'>{getAgentLabel(agentType)}</div>
                          <div className='text-12px opacity-80'>
                            {uniqueNames.slice(0, 8).join('、')}
                            {uniqueNames.length > 8 ? ` 等 ${uniqueNames.length} 个` : ''}
                          </div>
                        </div>
                      );
                    }}
                  >
                    <Button
                      size='small'
                      type={agentFilter === agentType ? 'primary' : 'outline'}
                      className='rounded-[100px]'
                      onClick={() => {
                        setAgentFilter(agentType);
                        setAssistantFilterIds([]);
                        setUnassignedMode('global');
                      }}
                    >
                      {(() => {
                        const info = agentTypeInfo.get(agentType);
                        const count = info?.count ?? 0;
                        return count > 1 ? `${getAgentLabel(agentType)} (${count})` : getAgentLabel(agentType);
                      })()}
                    </Button>
                  </Tooltip>
                ))}
                {hasNonPresetAssistants && (
                  <Button
                    size='small'
                    type={agentFilter === CUSTOM_ASSISTANT_AGENT_FILTER ? 'primary' : 'outline'}
                    className='rounded-[100px]'
                    onClick={() => {
                      setAgentFilter(CUSTOM_ASSISTANT_AGENT_FILTER);
                      setAssistantFilterIds([]);
                      setUnassignedMode('global');
                    }}
                  >
                    {t('settings.skillsHub.filterCustomAssistants', { defaultValue: 'Custom assistants' })}
                  </Button>
                )}
              </div>

              {(agentFilter !== 'all') && (
                <div className='flex flex-wrap items-center gap-10px mb-16px'>
                  <div className='flex items-center gap-8px'>
                    <span className='text-12px text-t-tertiary'>
                      {t('settings.skillsHub.filterByAssistant', { defaultValue: 'Filter by assistant' })}
                    </span>
                    {assistantFilterIds.length > 0 ? (
                      <Tag size='small' color='arcoblue'>
                        {t('settings.skillsHub.selectedCount', {
                          count: assistantFilterIds.length,
                          defaultValue: `${assistantFilterIds.length} selected`,
                        })}
                      </Tag>
                    ) : null}
                  </div>
                  {agentFilter === 'unassigned' && (
                    <Select
                      size='small'
                      className='w-full sm:w-[260px]'
                      value={unassignedMode}
                      onChange={(v) => setUnassignedMode(v as 'global' | 'selected-assistants')}
                      options={[
                        {
                          value: 'global',
                          label: t('settings.skillsHub.unassignedModeGlobal', {
                            defaultValue: 'Globally unassigned',
                          }),
                        },
                        {
                          value: 'selected-assistants',
                          label: t('settings.skillsHub.unassignedModeSelected', {
                            defaultValue: 'Not in selected assistants',
                          }),
                        },
                      ]}
                    />
                  )}
                  <div className='min-w-[240px] w-full sm:w-[360px]'>
                    <Select
                      mode='multiple'
                      allowClear
                      showSearch
                      placeholder={t('settings.skillsHub.filterAssistantsPlaceholder', {
                        defaultValue: 'Select assistants…',
                      })}
                      value={assistantFilterIds}
                      onChange={(value) => setAssistantFilterIds(Array.isArray(value) ? (value as string[]) : [])}
                      options={assistantsForSelectedAgentTypeOptions}
                      maxTagCount={2}
                      filterOption={(input, option) =>
                        String(option?.label ?? '')
                          .toLowerCase()
                          .includes(String(input).toLowerCase())
                      }
                    />
                  </div>
                </div>
              )}

              <div className='flex flex-col lg:flex-row lg:items-center flex-wrap gap-10px mb-16px'>
                <div className='flex flex-wrap items-center gap-8px'>
                  <Button
                    size='small'
                    type={skillListLayout === 'flat' ? 'primary' : 'outline'}
                    className='rounded-[100px]'
                    onClick={() => setSkillListLayout('flat')}
                  >
                    {t('settings.skillsHub.layoutFlat', { defaultValue: 'Flat list' })}
                  </Button>
                  <Button
                    size='small'
                    type={skillListLayout === 'by-assistant' ? 'primary' : 'outline'}
                    className='rounded-[100px]'
                    onClick={() => setSkillListLayout('by-assistant')}
                  >
                    {t('settings.skillsHub.layoutByAssistant', { defaultValue: 'By assistant' })}
                  </Button>
                </div>
                <Select
                  size='small'
                  className='w-full lg:w-[200px]'
                  value={skillSortMode}
                  onChange={(value) =>
                    setSkillSortMode(value as 'usage-desc' | 'usage-asc' | 'name-asc' | 'name-desc')
                  }
                  options={[
                    {
                      value: 'usage-desc',
                      label: t('settings.skillsHub.sortUsageDesc', { defaultValue: 'Usage: high → low' }),
                    },
                    {
                      value: 'usage-asc',
                      label: t('settings.skillsHub.sortUsageAsc', { defaultValue: 'Usage: low → high' }),
                    },
                    {
                      value: 'name-asc',
                      label: t('settings.skillsHub.sortNameAsc', { defaultValue: 'Name: A → Z' }),
                    },
                    {
                      value: 'name-desc',
                      label: t('settings.skillsHub.sortNameDesc', { defaultValue: 'Name: Z → A' }),
                    },
                  ]}
                />
                <Button size='small' type='outline' className='rounded-[100px]' onClick={() => openReplaceModal()}>
                  {t('settings.skillsHub.batchReplace', { defaultValue: 'Batch replace' })}
                </Button>
              </div>

              {/* Path Display moved below the toolbar */}
              {skillPaths && (
                <div className='flex items-center gap-8px text-12px text-t-tertiary font-mono bg-transparent py-4px mb-16px relative z-10 pt-4px border-t border-t-transparent'>
                  <FolderOpen size={16} className='shrink-0' />
                  <span className='truncate' title={skillPaths.userSkillsDir}>
                    {skillPaths.userSkillsDir}
                  </span>
                </div>
              )}

              {availableSkills.length > 0 ? (
                <div className='w-full flex flex-col gap-6px relative z-10'>
                  {skillListLayout === 'flat' ? (
                    displaySkills.map(renderMySkillRow)
                  ) : (
                    <>
                      {groupedAssistantSections.unassignedSkills.length > 0 && (
                        <div className='mb-16px flex flex-col gap-8px'>
                          <div className='text-13px font-semibold text-t-primary px-4px'>
                            {t('settings.skillsHub.sectionUnassigned', {
                              defaultValue: 'Unassigned skills',
                            })}
                          </div>
                          <div className='flex flex-col gap-6px'>
                            {groupedAssistantSections.unassignedSkills.map(renderMySkillRow)}
                          </div>
                        </div>
                      )}
                      {groupedAssistantSections.sections.map(({ assistant, skills }) => (
                        <div
                          key={assistant.id}
                          className='mb-16px flex flex-col gap-8px border border-border-1 rd-12px p-12px bg-fill-1'
                        >
                          <div className='flex flex-wrap items-center justify-between gap-8px px-4px'>
                            <div className='flex flex-wrap items-center gap-8px min-w-0'>
                              <span className='text-13px font-semibold text-t-primary truncate'>
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
                            {skills.length > 0 && (
                              <Button
                                size='mini'
                                type='outline'
                                className='shrink-0'
                                onClick={() => {
                                  const list = skills.map((s) => s.name).join(', ');
                                  Modal.confirm({
                                    title: t('settings.skillsHub.stripAssistantSkillsTitle', {
                                      defaultValue: 'Remove skills from this assistant?',
                                    }),
                                    content: t('settings.skillsHub.stripAssistantSkillsContent', {
                                      name: getAssistantDisplayName(assistant),
                                      list,
                                      defaultValue: `Remove all skills listed below from "${getAssistantDisplayName(assistant)}": ${list}`,
                                    }),
                                    okButtonProps: { status: 'danger' },
                                    onOk: () =>
                                      void handleStripListedSkillsFromAssistant(
                                        assistant.id,
                                        skills.map((s) => s.name)
                                      ),
                                  });
                                }}
                              >
                                {t('settings.skillsHub.stripAssistantSkillsButton', {
                                  defaultValue: 'Clear listed skills',
                                })}
                              </Button>
                            )}
                          </div>
                          <div className='flex flex-col gap-6px'>{skills.map(renderMySkillRow)}</div>
                        </div>
                      ))}
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

            {/* ======== Usage Tip ======== */}
            <div className='px-16px md:px-[24px] py-20px bg-base border border-b-base shadow-sm rd-16px flex items-start gap-12px text-t-secondary'>
              <Info size={18} className='text-primary-6 mt-2px shrink-0' />
              <div className='flex flex-col gap-4px'>
                <span className='font-bold text-t-primary text-14px'>
                  {t('settings.skillsHub.tipTitle', { defaultValue: 'Usage Tip:' })}
                </span>
                <span className='text-13px leading-relaxed'>{t('settings.skillsHub.tipContent')}</span>
              </div>
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
