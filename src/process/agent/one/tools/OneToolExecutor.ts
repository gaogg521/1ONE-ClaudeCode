/**
 * @license
 * Copyright 2025 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

interface ToolResult {
  success: boolean;
  output: string;
  outputType: 'text' | 'diff' | 'image';
  metadata?: Record<string, unknown>;
}

interface PendingTool {
  id: string;
  name: string;
  args: Record<string, unknown>;
  resolve: (result: ToolResult) => void;
  reject: (error: Error) => void;
}

/**
 * Tool executor for the built-in OneAgent
 * Provides file operations and command execution
 */
export class OneToolExecutor {
  private workspace: string;
  private autoApprove: boolean;
  private pendingTools = new Map<string, PendingTool>();

  constructor(workspace: string, autoApprove: boolean) {
    this.workspace = workspace;
    this.autoApprove = autoApprove;
  }

  /**
   * Get OpenAI-compatible tool definitions
   */
  getToolDefinitions(): Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: {
        type: 'object';
        properties: Record<string, unknown>;
        required?: string[];
      };
    };
  }> {
    return [
      {
        type: 'function',
        function: {
          name: 'read_file',
          description: 'Read the contents of a file',
          parameters: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: 'Path to the file to read (relative to workspace or absolute)',
              },
            },
            required: ['file_path'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'write_file',
          description: 'Write content to a file (creates if not exists, overwrites if exists)',
          parameters: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: 'Path to the file to write',
              },
              content: {
                type: 'string',
                description: 'Content to write to the file',
              },
            },
            required: ['file_path', 'content'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'edit_file',
          description: 'Apply a diff to a file. Use \\n for newlines in the diff.',
          parameters: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: 'Path to the file to edit',
              },
              old_string: {
                type: 'string',
                description: 'The exact string to find and replace',
              },
              new_string: {
                type: 'string',
                description: 'The replacement string',
              },
            },
            required: ['file_path', 'old_string', 'new_string'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'list_directory',
          description: 'List files and directories in the specified path',
          parameters: {
            type: 'object',
            properties: {
              directory_path: {
                type: 'string',
                description: 'Path to the directory to list',
              },
              recursive: {
                type: 'boolean',
                description: 'Whether to list recursively',
                default: false,
              },
            },
            required: ['directory_path'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'execute_command',
          description: 'Execute a shell command in the workspace',
          parameters: {
            type: 'object',
            properties: {
              command: {
                type: 'string',
                description: 'The command to execute',
              },
              timeout: {
                type: 'number',
                description: 'Timeout in milliseconds (default: 30000)',
                default: 30000,
              },
            },
            required: ['command'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'search_files',
          description: 'Search for files matching a pattern in the workspace',
          parameters: {
            type: 'object',
            properties: {
              pattern: {
                type: 'string',
                description: 'Glob pattern to search for',
              },
              path: {
                type: 'string',
                description: 'Directory to search in (default: workspace)',
              },
            },
            required: ['pattern'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'view_code_item',
          description: 'Get information about a specific code symbol (function, class, etc.)',
          parameters: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: 'Path to the file containing the symbol',
              },
              symbol_name: {
                type: 'string',
                description: 'Name of the symbol to look up',
              },
              symbol_type: {
                type: 'string',
                description: 'Type of symbol (function, class, method, etc.)',
                default: 'function',
              },
            },
            required: ['file_path', 'symbol_name'],
          },
        },
      },
    ];
  }

  /**
   * Execute a tool (auto-approved or waits for manual approval)
   */
  async executeTool(
    id: string,
    name: string,
    args: Record<string, unknown>
  ): Promise<ToolResult> {
    if (this.autoApprove) {
      return this.runTool(name, args);
    }

    // Wait for approval
    return new Promise((resolve, reject) => {
      this.pendingTools.set(id, { id, name, args, resolve, reject });
      // Timeout after 5 minutes
      setTimeout(() => {
        this.pendingTools.delete(id);
        reject(new Error('Tool approval timeout'));
      }, 300000);
    });
  }

  /**
   * Approve a pending tool call
   */
  async approveTool(id: string, _scope?: 'once' | 'session' | 'always'): Promise<void> {
    const pending = this.pendingTools.get(id);
    if (!pending) return;

    this.pendingTools.delete(id);
    const result = await this.runTool(pending.name, pending.args);
    pending.resolve(result);
  }

  /**
   * Deny a pending tool call
   */
  async denyTool(id: string, reason?: string): Promise<void> {
    const pending = this.pendingTools.get(id);
    if (!pending) return;

    this.pendingTools.delete(id);
    pending.resolve({
      success: false,
      output: reason || 'Tool execution denied by user',
      outputType: 'text',
    });
  }

  /**
   * Run a tool implementation
   */
  private async runTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    try {
      switch (name) {
        case 'read_file':
          return await this.readFile(args.file_path as string);
        case 'write_file':
          return await this.writeFile(args.file_path as string, args.content as string);
        case 'edit_file':
          return await this.editFile(
            args.file_path as string,
            args.old_string as string,
            args.new_string as string
          );
        case 'list_directory':
          return await this.listDirectory(
            args.directory_path as string,
            args.recursive as boolean
          );
        case 'execute_command':
          return await this.executeCommand(
            args.command as string,
            (args.timeout as number) || 30000
          );
        case 'search_files':
          return await this.searchFiles(args.pattern as string, args.path as string);
        case 'view_code_item':
          return await this.viewCodeItem(
            args.file_path as string,
            args.symbol_name as string,
            args.symbol_type as string
          );
        default:
        return {
          success: false,
          output: `Unknown tool: ${name}`,
          outputType: 'text',
        };
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        output: `Error executing ${name}: ${errMsg}`,
        outputType: 'text',
      };
    }
  }

  // Tool implementations
  private async readFile(filePath: string): Promise<ToolResult> {
    const resolvedPath = this.resolvePath(filePath);
    const content = await fs.readFile(resolvedPath, 'utf-8');
    return {
      success: true,
      output: content,
      outputType: 'text',
    };
  }

  private async writeFile(filePath: string, content: string): Promise<ToolResult> {
    const resolvedPath = this.resolvePath(filePath);
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    await fs.writeFile(resolvedPath, content, 'utf-8');
    return {
      success: true,
      output: `File written: ${filePath}`,
      outputType: 'text',
    };
  }

  private async editFile(
    filePath: string,
    oldString: string,
    newString: string
  ): Promise<ToolResult> {
    const resolvedPath = this.resolvePath(filePath);
    let content = await fs.readFile(resolvedPath, 'utf-8');

    if (!content.includes(oldString)) {
      return {
        success: false,
        output: `String not found in file: ${oldString.substring(0, 50)}...`,
        outputType: 'text',
      };
    }

    content = content.replace(oldString, newString);
    await fs.writeFile(resolvedPath, content, 'utf-8');

    return {
      success: true,
      output: `File edited: ${filePath}`,
      outputType: 'text',
    };
  }

  private async listDirectory(dirPath: string, recursive = false): Promise<ToolResult> {
    const resolvedPath = this.resolvePath(dirPath);

    if (recursive) {
      const entries: string[] = [];
      await this.listRecursive(resolvedPath, '', entries);
      return {
        success: true,
        output: entries.join('\n'),
        outputType: 'text',
      };
    } else {
      const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
      const lines = entries.map((e) => `${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}`);
      return {
        success: true,
        output: lines.join('\n'),
        outputType: 'text',
      };
    }
  }

  private async listRecursive(dir: string, prefix: string, result: string[]): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const name = prefix + entry.name;
      if (entry.isDirectory()) {
        result.push(`[DIR] ${name}/`);
        await this.listRecursive(path.join(dir, entry.name), name + '/', result);
      } else {
        result.push(`[FILE] ${name}`);
      }
    }
  }

  private async executeCommand(command: string, timeout: number): Promise<ToolResult> {
    const { stdout, stderr } = await execAsync(command, {
      cwd: this.workspace,
      timeout,
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });

    const output = stdout || stderr || 'Command executed successfully (no output)';
    return {
      success: true,
      output,
      outputType: 'text',
    };
  }

  private async searchFiles(pattern: string, searchPath?: string): Promise<ToolResult> {
    const glob = await import('glob');
    const resolvedPath = searchPath ? this.resolvePath(searchPath) : this.workspace;
    const matches = await glob.glob(pattern, { cwd: resolvedPath });

    return {
      success: true,
      output: matches.join('\n'),
      outputType: 'text',
    };
  }

  private async viewCodeItem(
    filePath: string,
    symbolName: string,
    symbolType: string
  ): Promise<ToolResult> {
    // Simple implementation - just read the file and search for the symbol
    const resolvedPath = this.resolvePath(filePath);
    const content = await fs.readFile(resolvedPath, 'utf-8');

    // Try to find the symbol
    const lines = content.split('\n');
    const matchingLines: string[] = [];
    let foundIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Simple pattern matching for function/class definitions
      const patterns = [
        new RegExp(`\\b(function|class|const|let|var|interface|type|enum)\\s+${symbolName}\\b`),
        new RegExp(`\\b${symbolName}\\s*\\(.*?\\)\\s*\\{?`),
        new RegExp(`\\b${symbolName}\\s*:\\s*`),
      ];
      if (patterns.some((p) => p.test(line))) {
        foundIndex = i;
        break;
      }
    }

    if (foundIndex >= 0) {
      // Extract context around the symbol (5 lines before and after)
      const start = Math.max(0, foundIndex - 5);
      const end = Math.min(lines.length, foundIndex + 20);
      const context = lines.slice(start, end);
      const lineNumWidth = String(end).length;
      const numbered = context.map((l, i) => `${String(start + i + 1).padStart(lineNumWidth)}| ${l}`);

      return {
        success: true,
        output: numbered.join('\n'),
        outputType: 'text',
      };
    }

    return {
      success: false,
      output: `Symbol "${symbolName}" (${symbolType}) not found in ${filePath}`,
      outputType: 'text',
    };
  }

  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return filePath;
    }
    return path.join(this.workspace, filePath);
  }
}
