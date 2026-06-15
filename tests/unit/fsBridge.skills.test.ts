import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import { EventEmitter } from 'node:events';

// Store all mock states at module scope to ensure they remain accessible in vi.doMock
let mockFsStore: Record<string, any> = {};
let mockCustomExternalPaths: Array<{ name: string; path: string }> = [];
let mockRemoteResponses: Record<
  string,
  {
    statusCode: number;
    headers?: Record<string, string>;
    body?: string | Buffer;
  }
> = {};
let mockZipEntries: Record<string, string | Buffer> = {};

describe('fsBridge skills functionality', () => {
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    mockFsStore = {};
    mockCustomExternalPaths = [];
    mockRemoteResponses = {};
    mockZipEntries = {};

    // Mock electron
    vi.doMock('electron', () => ({
      app: {
        isPackaged: false,
        getPath: vi.fn((name: string) => {
          if (name === 'userData') return '/mock/userData';
          if (name === 'home') return '/mock/home';
          return '/mock/path';
        }),
        getAppPath: vi.fn(() => '/mock/appPath'),
      },
    }));

    // Mock os
    vi.doMock('os', () => ({
      default: { homedir: vi.fn(() => '/mock/home') },
      homedir: vi.fn(() => '/mock/home'),
    }));

    // Mock fs/promises
    vi.doMock('fs', () => {
      const resolvePath = (p: string) => path.resolve(p);
      return {
        existsSync: vi.fn((filePath: string) => resolvePath(filePath) in mockFsStore),
        readFileSync: vi.fn((filePath: string, encoding?: BufferEncoding) => {
          const fp = resolvePath(filePath);
          if (fp in mockFsStore) {
            const fileContent = mockFsStore[fp];
            if (typeof fileContent === 'string') return fileContent;
            if (fileContent && typeof fileContent === 'object' && fileContent.content !== undefined) {
              if (Buffer.isBuffer(fileContent.content) && encoding === 'utf-8') {
                return fileContent.content.toString('utf-8');
              }
              return fileContent.content;
            }
          }
          throw new Error(`ENOENT: no such file or directory, open '${fp}'`);
        }),
      };
    });

    // Mock fs/promises
    vi.doMock('fs/promises', () => {
      const resolvePath = (p: string) => path.resolve(p);
      return {
        default: {
          access: vi.fn(async (filePath: string) => {
            const fp = resolvePath(filePath);
            if (fp in mockFsStore) return;
            throw new Error(`ENOENT: no such file or directory, access '${fp}'`);
          }),
          readFile: vi.fn(async (filePath: string, encoding?: BufferEncoding | { encoding?: BufferEncoding }) => {
            const fp = resolvePath(filePath);
            if (fp.endsWith('custom_external_skill_paths.json')) {
              return JSON.stringify(mockCustomExternalPaths);
            }
            if (fp in mockFsStore) {
              const fileContent = mockFsStore[fp];
              if (typeof fileContent === 'string') return fileContent;
              if (fileContent && typeof fileContent === 'object' && fileContent.content !== undefined) {
                const requestedEncoding = typeof encoding === 'string' ? encoding : encoding?.encoding;
                if (Buffer.isBuffer(fileContent.content) && requestedEncoding === 'utf-8') {
                  return fileContent.content.toString('utf-8');
                }
                return fileContent.content;
              }
              throw new Error(`EISDIR: illegal operation on a directory, read '${fp}'`);
            }
            const err = new Error(`ENOENT: no such file or directory, open '${fp}'`) as NodeJS.ErrnoException;
            err.code = 'ENOENT';
            throw err;
          }),
          writeFile: vi.fn(async (filePath: string, content: string) => {
            const fp = resolvePath(filePath);
            if (fp.endsWith('custom_external_skill_paths.json')) {
              mockCustomExternalPaths = JSON.stringify(content) ? JSON.parse(content as string) : [];
              return;
            }
            mockFsStore[fp] = { content, isDirectory: false };
          }),
          readdir: vi.fn(async (dirPath: string, options?: { withFileTypes?: boolean }) => {
            const dp = resolvePath(dirPath);
            if (!(dp in mockFsStore)) throw new Error(`ENOENT: no such file or directory, scandir '${dp}'`);

            const entries = [];
            for (const key of Object.keys(mockFsStore)) {
              if (key !== dp && key.startsWith(dp + path.sep)) {
                const relativePath = key.substring(dp.length + 1);
                if (!relativePath.includes(path.sep)) {
                  entries.push({
                    name: relativePath,
                    isDirectory: () => !!mockFsStore[key].isDirectory && !mockFsStore[key].isSymlink,
                    isFile: () => !mockFsStore[key].isDirectory && !mockFsStore[key].isSymlink,
                    isSymbolicLink: () => !!mockFsStore[key].isSymlink,
                  });
                }
              }
            }
            return entries;
          }),
          mkdir: vi.fn(async (dirPath: string) => {
            const resolvedDir = resolvePath(dirPath);
            const parts = resolvedDir.split(path.sep);
            const base = resolvedDir.startsWith(path.sep) ? path.sep : '';
            let current = base;
            for (const part of parts.filter(Boolean)) {
              current = current ? path.join(current, part) : part;
              mockFsStore[current] = { isDirectory: true };
            }
          }),
          copyFile: vi.fn(async (src: string, dest: string) => {
            const s = resolvePath(src);
            const d = resolvePath(dest);
            if (!(s in mockFsStore)) throw new Error(`ENOENT: src not found '${s}'`);
            mockFsStore[d] = { ...mockFsStore[s] };
          }),
          cp: vi.fn(async (src: string, dest: string) => {
            const s = resolvePath(src);
            const d = resolvePath(dest);
            for (const key of Object.keys(mockFsStore)) {
              if (key === s || key.startsWith(s + path.sep)) {
                const relativePath = path.relative(s, key);
                const targetPath = relativePath ? path.join(d, relativePath) : d;
                mockFsStore[targetPath] = { ...mockFsStore[key] };
              }
            }
          }),
          lstat: vi.fn(async (filePath: string) => {
            const fp = resolvePath(filePath);
            if (!(fp in mockFsStore)) throw new Error(`ENOENT: lstat '${fp}'`);
            const isSymlink = !!mockFsStore[fp]?.isSymlink;
            return {
              isDirectory: () => !!mockFsStore[fp]?.isDirectory,
              isFile: () => !mockFsStore[fp]?.isDirectory && !isSymlink,
              isSymbolicLink: () => isSymlink,
            };
          }),
          stat: vi.fn(async (filePath: string) => {
            const fp = resolvePath(filePath);
            if (!(fp in mockFsStore)) {
              const err = new Error(`ENOENT: no such file or directory, stat '${fp}'`) as NodeJS.ErrnoException;
              err.code = 'ENOENT';
              throw err;
            }
            return {
              isDirectory: () => !!mockFsStore[fp]?.isDirectory,
              isFile: () => !mockFsStore[fp]?.isDirectory,
              size: 1024,
              mtime: new Date(),
            };
          }),
          symlink: vi.fn(async (src: string, dest: string) => {
            const s = resolvePath(src);
            const d = resolvePath(dest);
            mockFsStore[d] = { isSymlink: true, target: s, isDirectory: mockFsStore[s]?.isDirectory };
          }),
          unlink: vi.fn(async (filePath: string) => {
            delete mockFsStore[resolvePath(filePath)];
          }),
          rm: vi.fn(async (dirPath: string) => {
            const dp = resolvePath(dirPath);
            for (const key in mockFsStore) {
              if (key === dp || key.startsWith(dp + path.sep)) {
                delete mockFsStore[key];
              }
            }
          }),
        },
      };
    });

    // Mock jszip
    vi.doMock('jszip', () => {
      class MockJSZip {
        file = vi.fn();
        generateAsync = vi.fn(async () => Buffer.from('fake-zip-content'));

        static async loadAsync() {
          return {
            files: Object.fromEntries(
              Object.entries(mockZipEntries).map(([name, content]) => [
                name,
                {
                  name,
                  dir: false,
                  async: async () => (Buffer.isBuffer(content) ? content : Buffer.from(content)),
                },
              ])
            ),
          };
        }
      }
      return { default: MockJSZip };
    });

    const createHttpModuleMock = () => ({
      default: {
        get: vi.fn((targetUrl: string, _options: unknown, callback: (response: EventEmitter & any) => void) => {
          const request = new EventEmitter() as EventEmitter & {
            setTimeout: (ms: number, handler: () => void) => void;
            destroy: (error?: Error) => void;
          };
          request.setTimeout = (_ms, _handler) => {};
          request.destroy = (error?: Error) => {
            if (error) {
              request.emit('error', error);
            }
          };

          const responseConfig = mockRemoteResponses[targetUrl];
          queueMicrotask(() => {
            if (!responseConfig) {
              request.emit('error', new Error(`No mocked response for ${targetUrl}`));
              return;
            }
            const response = new EventEmitter() as EventEmitter & {
              statusCode?: number;
              headers: Record<string, string>;
              resume: () => void;
            };
            response.statusCode = responseConfig.statusCode;
            response.headers = responseConfig.headers || {};
            response.resume = () => {};
            callback(response);
            if (responseConfig.body) {
              response.emit(
                'data',
                Buffer.isBuffer(responseConfig.body) ? responseConfig.body : Buffer.from(responseConfig.body)
              );
            }
            response.emit('end');
          });

          return request;
        }),
      },
    });

    vi.doMock('node:https', createHttpModuleMock);
    vi.doMock('node:http', createHttpModuleMock);

    // Mock initStorage
    vi.doMock('@process/utils/initStorage', () => ({
      getSystemDir: vi.fn(() => ({
        cacheDir: '/mock/cache',
        workDir: '/mock/work',
        platform: 'win32',
        arch: 'x64',
      })),
      getAssistantsDir: vi.fn(() => '/mock/userData/assistants'),
      getSkillsDir: vi.fn(() => '/mock/userData/config/skills'),
      getBuiltinSkillsCopyDir: vi.fn(() => path.resolve('/mock/userData/builtin-skills')),
      getAutoSkillsDir: vi.fn(() => path.resolve('/mock/userData/auto-skills')),
      ProcessEnv: { set: vi.fn() },
    }));

    // Start with empty IPC handlers map
    const handlers: Record<string, Function> = {};

    // Mock ipcBridge precisely to capture registered providers
    vi.doMock('@/common', () => {
      const createCommandMock = (channel: string) => {
        return {
          provider: vi.fn((fn) => {
            handlers[channel] = fn;
          }),
          invoke: vi.fn((payload) =>
            handlers[channel] ? handlers[channel](payload) : Promise.reject(`No handler for ${channel}`)
          ),
          emit: vi.fn(),
        };
      };

      return {
        ipcBridge: {
          fs: {
            getFilesByDir: createCommandMock('get-file-by-dir'),
            getImageBase64: createCommandMock('get-image-base64'),
            fetchRemoteImage: createCommandMock('fetch-remote-image'),
            readFile: createCommandMock('read-file'),
            readFileBuffer: createCommandMock('read-file-buffer'),
            createTempFile: createCommandMock('create-temp-file'),
            writeFile: createCommandMock('write-file'),
            createZip: createCommandMock('create-zip-file'),
            cancelZip: createCommandMock('cancel-zip-file'),
            getFileMetadata: createCommandMock('get-file-metadata'),
            resolveAttachmentDisplayPath: createCommandMock('resolve-attachment-display-path'),
            copyFilesToWorkspace: createCommandMock('copy-files-to-workspace'),
            removeEntry: createCommandMock('remove-entry'),
            renameEntry: createCommandMock('rename-entry'),
            readBuiltinRule: createCommandMock('read-builtin-rule'),
            readBuiltinSkill: createCommandMock('read-builtin-skill'),
            readAssistantRule: createCommandMock('read-assistant-rule'),
            writeAssistantRule: createCommandMock('write-assistant-rule'),
            deleteAssistantRule: createCommandMock('delete-assistant-rule'),
            readAssistantSkill: createCommandMock('read-assistant-skill'),
            writeAssistantSkill: createCommandMock('write-assistant-rule'), // intentional generic mock fallback
            deleteAssistantSkill: createCommandMock('delete-assistant-skill'),
            // The specific ones we care about
            listAvailableSkills: createCommandMock('list-available-skills'),
            listAutoSkills: createCommandMock('list-auto-skills'),
            readSkillInfo: createCommandMock('read-skill-info'),
            importSkill: createCommandMock('import-skill'),
            scanForSkills: createCommandMock('scan-for-skills'),
            detectCommonSkillPaths: createCommandMock('detect-common-skill-paths'),
            detectAndCountExternalSkills: createCommandMock('detect-and-count-external-skills'),
            importSkillWithSymlink: createCommandMock('import-skill-with-symlink'),
            previewSkillsFromUrl: createCommandMock('preview-skills-from-url'),
            importSkillFromUrl: createCommandMock('import-skill-from-url'),
            deleteSkill: createCommandMock('delete-skill'),
            getSkillPaths: createCommandMock('get-skill-paths'),
            exportSkillWithSymlink: createCommandMock('export-skill-with-symlink'),
            getCustomExternalPaths: createCommandMock('get-custom-external-paths'),
            addCustomExternalPath: createCommandMock('add-custom-external-path'),
            removeCustomExternalPath: createCommandMock('remove-custom-external-path'),
            enableSkillsMarket: createCommandMock('enable-skills-market'),
            disableSkillsMarket: createCommandMock('disable-skills-market'),
          },
          fileStream: {
            contentUpdate: { emit: vi.fn() },
          },
        },
      };
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  // Helper macro to fetch the actual implemented provider endpoint
  const getProvider = async (channel: string) => {
    const mod = await import('@process/bridge/fsBridge');
    mod.initFsBridge();
    const ipcMod = await import('@/common');
    // Type assertion hack, accessing the internal registered function logic
    const mockCmd =
      (ipcMod.ipcBridge.fs as any)[
        channel
          .split('-')
          .map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
          .join('')
      ] ||
      (ipcMod.ipcBridge.fs as any)[channel] ||
      (
        Object.values(ipcMod.ipcBridge.fs).find(
          (v: any) => v.provider?.mock?.calls?.length && v.provider.mock.calls[0][0]
        ) as any
      )?.invoke; // Fallback

    // Because my mock logic intercepts the provider call, I can extract it directly from the mock calls
    for (const key of Object.keys(ipcMod.ipcBridge.fs)) {
      const item = (ipcMod.ipcBridge.fs as any)[key];
      if (
        item &&
        item.provider &&
        item.provider.mock &&
        item.provider.mock.calls &&
        item.provider.mock.calls.length > 0
      ) {
        // We map the mock command to its actual registration name
        // if this command matches our requested test, extract its provider function
        if (key === channel) {
          return item.provider.mock.calls[0][0]; // The actual async function passed to provider()
        }
      }
    }
    throw new Error(`Provider ${channel} not found in registered mocks`);
  };

  describe('readFile ENOENT handling (Fixes ELECTRON-6W)', () => {
    it('returns null when file does not exist instead of throwing', async () => {
      const handler = await getProvider('readFile');
      const result = await handler({ path: '/nonexistent/gemini-temp-123/README.md' });
      expect(result).toBeNull();
    });

    it('still throws for non-ENOENT errors (e.g., EISDIR)', async () => {
      // Create a directory entry so readFile throws EISDIR
      mockFsStore[path.resolve('/mock/some-dir')] = { isDirectory: true };
      const handler = await getProvider('readFile');
      await expect(handler({ path: '/mock/some-dir' })).rejects.toThrow('EISDIR');
    });
  });

  describe('readFileBuffer ENOENT handling', () => {
    it('returns null when file does not exist instead of throwing', async () => {
      const handler = await getProvider('readFileBuffer');
      const result = await handler({ path: '/nonexistent/temp-workspace/file.bin' });
      expect(result).toBeNull();
    });
  });

  describe('listAvailableSkills', () => {
    it('should correctly parse SKILL.md and distinguish builtin vs custom', async () => {
      // Setup filesystem mock state
      const builtinBase = path.resolve('/mock/userData/builtin-skills');
      const userBase = path.resolve('/mock/userData/config/skills');

      const yamlFrontmatterBuiltin = `---\nname: BuiltinTest\ndescription: 'A builtin test skill'\n---\n# Markdown content`;
      const yamlFrontmatterCustom = `---\nname: CustomTest\ndescription: "A custom test skill"\n---\n`;
      const yamlFrontmatterDuplicate = `---\nname: BuiltinTest\ndescription: "Shadowed custom skill"\n---\n`;

      mockFsStore[builtinBase] = { isDirectory: true };
      mockFsStore[path.join(builtinBase, 'test-skill-1')] = { isDirectory: true };
      mockFsStore[path.join(builtinBase, 'test-skill-1', 'SKILL.md')] = {
        content: yamlFrontmatterBuiltin,
        isDirectory: false,
      };
      mockFsStore[path.join(builtinBase, '_builtin')] = { isDirectory: true }; // Should be skipped

      mockFsStore[userBase] = { isDirectory: true };
      mockFsStore[path.join(userBase, 'custom-skill')] = { isDirectory: true };
      mockFsStore[path.join(userBase, 'custom-skill', 'SKILL.md')] = {
        content: yamlFrontmatterCustom,
        isDirectory: false,
      };
      // Duplicate skill name, should be deduped keeping builtin
      mockFsStore[path.join(userBase, 'duplicate-skill')] = { isDirectory: true };
      mockFsStore[path.join(userBase, 'duplicate-skill', 'SKILL.md')] = {
        content: yamlFrontmatterDuplicate,
        isDirectory: false,
      };

      const handler = await getProvider('listAvailableSkills');
      const result = await handler();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(3);

      const builtin = result.find((s: any) => s.name === 'BuiltinTest');
      expect(builtin).toBeDefined();
      expect(builtin.isCustom).toBe(false); // Keeps builtin status even though duplicate exists in user dir
      expect(builtin.description).toBe('A builtin test skill');

      const custom = result.find((s: any) => s.name === 'CustomTest');
      expect(custom).toBeDefined();
      expect(custom.isCustom).toBe(true);

      const shadowed = result.find((s: any) => s.directory.endsWith('duplicate-skill'));
      expect(shadowed).toBeDefined();
      expect(shadowed.effective).toBe(false);
      expect(shadowed.shadowedBy.bySourceKind).toBe('builtin');
    });
  });

  describe('detectAndCountExternalSkills', () => {
    it('should detect direct skills and nested skill packs from common and custom paths', async () => {
      const geminiPath = path.resolve('/mock/home/.gemini/skills');
      const customSrcPath = path.resolve('/mock/my/custom/path');

      // Configure mock custom paths
      mockCustomExternalPaths = [{ name: 'My Custom Path', path: customSrcPath }];
      const workBase = path.resolve('/mock/work');
      mockFsStore[workBase] = { isDirectory: true };
      mockFsStore[path.join(workBase, 'custom_external_skill_paths.json')] = { isDirectory: false }; // Let it use mockCustomExternalPaths

      const yamlDirect1 = `---\nname: DirectGemini\ndescription: direct gemini skill\n---`;
      const yamlNested1 = `---\nname: NestedGemini\n---`;
      const yamlCustom = `---\nname: CustomExtSkill\n---`;

      // Setup Gemini direct skill
      mockFsStore[geminiPath] = { isDirectory: true };
      mockFsStore[path.join(geminiPath, 'direct-skill')] = { isDirectory: true };
      mockFsStore[path.join(geminiPath, 'direct-skill', 'SKILL.md')] = { content: yamlDirect1, isDirectory: false };

      // Setup Gemini nested skill pack
      mockFsStore[path.join(geminiPath, 'pack-skill')] = { isDirectory: true };
      mockFsStore[path.join(geminiPath, 'pack-skill', 'skills')] = { isDirectory: true };
      mockFsStore[path.join(geminiPath, 'pack-skill', 'skills', 'nested-skill')] = { isDirectory: true };
      mockFsStore[path.join(geminiPath, 'pack-skill', 'skills', 'nested-skill', 'SKILL.md')] = {
        content: yamlNested1,
        isDirectory: false,
      };

      // Setup custom path skill
      mockFsStore[customSrcPath] = { isDirectory: true };
      mockFsStore[path.join(customSrcPath, 'custom-ext-skill')] = { isDirectory: true };
      mockFsStore[path.join(customSrcPath, 'custom-ext-skill', 'SKILL.md')] = {
        content: yamlCustom,
        isDirectory: false,
      };

      const handler = await getProvider('detectAndCountExternalSkills');
      const result = await handler();

      if (!result.success) {
        console.log('detectAndCountExternalSkills failed:', result);
      } else if (result.data.length === 0) {
        console.log('detectAndCountExternalSkills data is empty:', result);
      }

      expect(result.success, result.msg || JSON.stringify(result)).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);

      // Should find records for "Gemini CLI" and "My Custom Path" matching the valid files
      const geminiGroup = result.data.find((d: any) => d.source === 'gemini');
      expect(geminiGroup).toBeDefined();
      expect(geminiGroup.skills).toHaveLength(2);
      expect(geminiGroup.skills.some((s: any) => s.name === 'DirectGemini')).toBe(true);
      expect(geminiGroup.skills.some((s: any) => s.name === 'NestedGemini')).toBe(true);

      const customGroup = result.data.find((d: any) => d.source.startsWith('custom-'));
      expect(customGroup).toBeDefined();
      expect(customGroup.skills).toHaveLength(1);
      expect(customGroup.skills[0].name).toBe('CustomExtSkill');
    });
  });

  describe('Custom External Paths Management', () => {
    it('should add, get and remove custom paths', async () => {
      const workBase = path.resolve('/mock/work');
      mockFsStore[workBase] = { isDirectory: true };
      mockFsStore[path.join(workBase, 'custom_external_skill_paths.json')] = { isDirectory: false };

      const addHandler = await getProvider('addCustomExternalPath');
      const result1 = await addHandler({ name: 'TestPath', path: '/foo/bar' });
      expect(result1.success).toBe(true);

      // Check state
      expect(mockCustomExternalPaths).toHaveLength(1);
      expect(mockCustomExternalPaths[0].name).toBe('TestPath');

      // Try to add duplicate
      const result2 = await addHandler({ name: 'TestPath', path: '/foo/bar' });
      expect(result2.success).toBe(false);
      expect(result2.msg).toBe('Path already exists');

      // Remove path
      const rmHandler = await getProvider('removeCustomExternalPath');
      const result3 = await rmHandler({ path: '/foo/bar' });
      expect(result3.success).toBe(true);
      expect(mockCustomExternalPaths).toHaveLength(0);
    });
  });

  describe('importSkillWithSymlink', () => {
    it('should successfully copy a valid skill directory to user config and fail if missing SKILL.md', async () => {
      const srcPath = path.resolve('/mock/source/valid-skill');
      const badPath = path.resolve('/mock/source/invalid-skill');
      const targetBase = path.resolve('/mock/userData/config/skills');

      mockFsStore[srcPath] = { isDirectory: true };
      mockFsStore[path.join(srcPath, 'SKILL.md')] = {
        content: '---\nname: ValidSymlinkSkill\n---\nData',
        isDirectory: false,
      };
      mockFsStore[path.join(srcPath, 'extra.txt')] = { content: 'hello', isDirectory: false };

      mockFsStore[badPath] = { isDirectory: true };
      // No SKILL.md in badPath

      const handler = await getProvider('importSkillWithSymlink');

      // Success case
      const result1 = await handler({ skillPath: srcPath });
      expect(result1.success).toBe(true);
      expect(result1.data.skillName).toBe('ValidSymlinkSkill');

      // Check if symlink created at target
      const expectedTarget = path.join(targetBase, 'ValidSymlinkSkill');
      expect(mockFsStore[expectedTarget]).toBeDefined();
      expect(mockFsStore[expectedTarget].isSymlink).toBe(true);
      expect(mockFsStore[expectedTarget].target).toBe(srcPath);

      // Try importing same skill again
      const result2 = await handler({ skillPath: srcPath });
      expect(result2.success).toBe(false);
      expect(result2.msg).toContain('already exists');

      // Failure case missing SKILL.md
      const result3 = await handler({ skillPath: badPath });
      expect(result3.success).toBe(false);
      expect(result3.msg).toContain('SKILL.md file not found');
    });
  });

  describe('exportSkillWithSymlink', () => {
    it('should successfully copy a skill to the external path', async () => {
      const srcPath = path.resolve('/mock/userData/config/skills/MySkill');
      const targetDir = path.resolve('/mock/home/.claude/skills');
      const targetPath = path.join(targetDir, 'MySkill');

      mockFsStore[srcPath] = { isDirectory: true };
      mockFsStore[path.join(srcPath, 'SKILL.md')] = { content: 'test', isDirectory: false };

      const handler = await getProvider('exportSkillWithSymlink');
      const result = await handler({ skillPath: srcPath, targetDir });

      expect(result.success).toBe(true);
      expect(mockFsStore[targetPath]).toBeDefined();
      expect(mockFsStore[targetPath].isDirectory).toBe(true);
      expect(mockFsStore[path.join(targetPath, 'SKILL.md')]).toBeDefined();
    });

    it('should fail if target already exists', async () => {
      const srcPath = path.resolve('/mock/userData/config/skills/MySkill');
      const targetDir = path.resolve('/mock/home/.claude/skills');
      const targetPath = path.join(targetDir, 'MySkill');

      mockFsStore[srcPath] = { isDirectory: true };
      // Pre-create target
      mockFsStore[targetDir] = { isDirectory: true };
      mockFsStore[targetPath] = { isDirectory: true };

      const handler = await getProvider('exportSkillWithSymlink');
      const result = await handler({ skillPath: srcPath, targetDir });

      expect(result.success).toBe(false);
      expect(result.msg).toContain('Target already exists');
    });
  });

  describe('deleteSkill', () => {
    it('should delete existing skill from user directory', async () => {
      const userBase = path.resolve('/mock/userData/config/skills');
      const skillPath = path.join(userBase, 'SkillToDelete');

      mockFsStore[userBase] = { isDirectory: true };
      mockFsStore[skillPath] = { isDirectory: true };
      mockFsStore[path.join(skillPath, 'SKILL.md')] = { content: '', isDirectory: false };

      const handler = await getProvider('deleteSkill');
      const result = await handler({ skillName: 'SkillToDelete' });

      expect(result.success).toBe(true);
      expect(mockFsStore[skillPath]).toBeUndefined();
      expect(mockFsStore[path.join(skillPath, 'SKILL.md')]).toBeUndefined();
    });

    it('should fail for traversal attacks or invalid paths', async () => {
      const handler = await getProvider('deleteSkill');
      // This will resolve to something outside the skills dir, the path.resolve security check will catch it
      const result = await handler({ skillName: '../config' });

      expect(result.success).toBe(false);
      expect(result.msg).toContain('security check failed');
    });
  });

  describe('createZip ensures parent directory exists (Fixes ELECTRON-66)', () => {
    it('creates parent directory before writing zip file', async () => {
      const handler = await getProvider('createZip');
      const exportDir = path.resolve('/mock/export/subdir');
      const zipPath = path.join(exportDir, 'batch-export-test.zip');

      const result = await handler({
        path: zipPath,
        files: [{ name: 'test.txt', content: 'hello' }],
        requestId: 'test-req-1',
      });

      expect(result).toBe(true);
      // Verify parent directory was created
      expect(mockFsStore[exportDir]).toBeDefined();
    });
  });

  describe('readBuiltinRule ENOENT handling (Fixes ELECTRON-68)', () => {
    it('returns empty string when builtin rule file does not exist instead of throwing', async () => {
      const handler = await getProvider('readBuiltinRule');
      const result = await handler({ fileName: 'nonexistent-rule.md' });
      expect(result).toBe('');
    });
  });

  describe('readBuiltinSkill ENOENT handling', () => {
    it('returns empty string when builtin skill file does not exist instead of throwing', async () => {
      const handler = await getProvider('readBuiltinSkill');
      const result = await handler({ fileName: 'nonexistent-skill.md' });
      expect(result).toBe('');
    });
  });

  describe('fetchRemoteImage — error handling', () => {
    it('returns empty string for disallowed host instead of throwing', async () => {
      const handler = await getProvider('fetchRemoteImage');
      // URL with a host not in the allowlist triggers Promise.reject inside downloadRemoteBuffer
      const result = await handler({ url: 'https://evil.com/malicious.png' });
      expect(result).toBe('');
    });

    it('returns empty string for unsupported protocol', async () => {
      const handler = await getProvider('fetchRemoteImage');
      const result = await handler({ url: 'ftp://github.com/image.png' });
      expect(result).toBe('');
    });
  });

  describe('scanForSkills', () => {
    it('should find skills nested in subdirectories or directly at the root', async () => {
      const scanDir = path.resolve('/mock/scan/dir');

      // Scenario 1: Subdir
      mockFsStore[scanDir] = { isDirectory: true };
      mockFsStore[path.join(scanDir, 'sub-skill')] = { isDirectory: true };
      mockFsStore[path.join(scanDir, 'sub-skill', 'SKILL.md')] = {
        content: '---\nname: SubSkill\ndescription: sub\n---',
        isDirectory: false,
      };

      // Let's add another dir without skill.md
      mockFsStore[path.join(scanDir, 'empty-dir')] = { isDirectory: true };

      const handler = await getProvider('scanForSkills');
      const result = await handler({ folderPath: scanDir });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('SubSkill');

      // Scenario 2: Root dir directly is a skill
      const rootSkillDir = path.resolve('/mock/scan/rootskill');
      mockFsStore[rootSkillDir] = { isDirectory: true };
      mockFsStore[path.join(rootSkillDir, 'SKILL.md')] = { content: '---\nname: RootSkill\n---', isDirectory: false };

      const result2 = await handler({ folderPath: rootSkillDir });
      expect(result2.success).toBe(true);
      expect(result2.data).toHaveLength(1);
      expect(result2.data[0].name).toBe('RootSkill');
    });
  });

  describe('previewSkillsFromUrl', () => {
    it('should preview skills from a GitHub repo root URL', async () => {
      mockRemoteResponses['https://api.github.com/repos/acme/skill-pack'] = {
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ default_branch: 'main' }),
      };
      mockRemoteResponses['https://codeload.github.com/acme/skill-pack/zip/refs/heads/main'] = {
        statusCode: 200,
        headers: { 'content-type': 'application/zip' },
        body: Buffer.from('zip-root'),
      };
      mockZipEntries = {
        'skill-pack-main/skills/alpha/SKILL.md': '---\nname: Alpha\n---',
        'skill-pack-main/skills/beta/SKILL.md': '---\nname: Beta\n---',
      };

      const handler = await getProvider('previewSkillsFromUrl');
      const result = await handler({ url: 'https://github.com/acme/skill-pack' });

      expect(result.success, result.msg || JSON.stringify(result)).toBe(true);
      expect(result.data.sourceUrl).toBe('https://github.com/acme/skill-pack');
      expect(result.data.resolvedUrl).toBe('https://github.com/acme/skill-pack/tree/main');
      expect(result.data.skills.map((skill: any) => skill.name)).toEqual(['Alpha', 'Beta']);
    });

    it('should preview a skill from a GitHub tree directory URL', async () => {
      mockRemoteResponses['https://codeload.github.com/acme/toolbox/zip/refs/heads/release'] = {
        statusCode: 200,
        headers: { 'content-type': 'application/zip' },
        body: Buffer.from('zip-tree'),
      };
      mockZipEntries = {
        'toolbox-release/skills/lark/SKILL.md': '---\nname: LarkFlow\n---',
      };

      const handler = await getProvider('previewSkillsFromUrl');
      const result = await handler({ url: 'https://github.com/acme/toolbox/tree/release/skills/lark' });

      expect(result.success, result.msg || JSON.stringify(result)).toBe(true);
      expect(result.data.resolvedUrl).toBe('https://github.com/acme/toolbox/tree/release/skills/lark');
      expect(result.data.skills).toHaveLength(1);
      expect(result.data.skills[0].name).toBe('LarkFlow');
    });

    it('should support raw SKILL.md links by previewing the containing skill directory', async () => {
      mockRemoteResponses['https://codeload.github.com/acme/toolbox/zip/refs/heads/release'] = {
        statusCode: 200,
        headers: { 'content-type': 'application/zip' },
        body: Buffer.from('zip-raw'),
      };
      mockZipEntries = {
        'toolbox-release/skills/docs/SKILL.md': '---\nname: DocsSkill\n---',
      };

      const handler = await getProvider('previewSkillsFromUrl');
      const result = await handler({
        url: 'https://raw.githubusercontent.com/acme/toolbox/release/skills/docs/SKILL.md',
      });

      expect(result.success, result.msg || JSON.stringify(result)).toBe(true);
      expect(result.data.resolvedUrl).toBe('https://github.com/acme/toolbox/tree/release/skills/docs');
      expect(result.data.skills).toHaveLength(1);
      expect(result.data.skills[0].name).toBe('DocsSkill');
    });

    it('should reject unsupported non-GitHub URLs', async () => {
      const handler = await getProvider('previewSkillsFromUrl');
      const result = await handler({ url: 'https://example.com/not-supported' });

      expect(result.success).toBe(false);
      expect(result.msg).toContain('GitHub');
    });
  });

  describe('importSkillFromUrl', () => {
    it('should import a previewed GitHub skill by copying it into the user skills directory', async () => {
      const previewedSkillDir = path.resolve('/mock/cache/github-skill-imports/preview-1/skill-alpha');
      const userSkillsDir = path.resolve('/mock/userData/config/skills');

      mockFsStore[previewedSkillDir] = { isDirectory: true };
      mockFsStore[path.join(previewedSkillDir, 'SKILL.md')] = {
        content: '---\nname: ImportedFromGithub\n---\nData',
        isDirectory: false,
      };
      mockFsStore[path.join(previewedSkillDir, 'README.md')] = {
        content: '# hello',
        isDirectory: false,
      };
      mockFsStore[userSkillsDir] = { isDirectory: true };

      const handler = await getProvider('importSkillFromUrl');
      const result = await handler({ skillPath: previewedSkillDir });

      expect(result.success, result.msg || JSON.stringify(result)).toBe(true);
      expect(result.data.skillName).toBe('ImportedFromGithub');
      expect(mockFsStore[path.join(userSkillsDir, 'ImportedFromGithub')]).toBeDefined();
      expect(mockFsStore[path.join(userSkillsDir, 'ImportedFromGithub', 'SKILL.md')]).toBeDefined();
    });
  });
});
