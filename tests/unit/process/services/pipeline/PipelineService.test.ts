/**
 * @license
 * Copyright 2026 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import { PipelineService } from '@process/services/pipeline/PipelineService';

// Mock electron
vi.mock('electron', () => ({ app: { getPath: vi.fn(() => '/tmp/test') } }));

// Mock database with SQLite-style prepare() API
const mockPrepareInstance = vi.hoisted(() => ({
  run: vi.fn(),
  get: vi.fn(),
  all: vi.fn(),
}));

const mockDriver = vi.hoisted(() => ({
  prepare: vi.fn(() => mockPrepareInstance),
}));

const mockDb = vi.hoisted(() => ({
  getDriver: vi.fn(() => mockDriver),
}));

vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn(() => Promise.resolve(mockDb)),
}));

// Mock child_process spawn
const mockStdout = new EventEmitter();
const mockStderr = new EventEmitter();
const mockChildProcess = Object.assign(new EventEmitter(), {
  stdout: mockStdout,
  stderr: mockStderr,
  pid: 12345,
});

vi.mock('child_process', () => ({
  spawn: vi.fn(() => mockChildProcess),
}));

import { spawn } from 'child_process';

describe('PipelineService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Pipelines CRUD', () => {
    it('getPipelines should query the database for current tenant', async () => {
      const mockPipelines = [
        {
          id: 'pl-1',
          tenant_id: 'default',
          name: 'Test Pipeline 1',
          associated_team_id: null,
          definition_json: '{}',
          enabled: 1,
          created_at: 1000,
          updated_at: 1000,
        },
      ];

      mockPrepareInstance.all.mockReturnValue(mockPipelines);

      const service = PipelineService.getInstance();
      const result = await service.getPipelines('default');

      expect(mockDriver.prepare).toHaveBeenCalledWith(
        'SELECT * FROM devops_pipelines WHERE tenant_id = ? ORDER BY created_at DESC'
      );
      expect(mockPrepareInstance.all).toHaveBeenCalledWith('default');
      expect(result).toEqual(mockPipelines);
    });

    it('getPipeline should query database by ID', async () => {
      const mockPipeline = {
        id: 'pl-1',
        tenant_id: 'default',
        name: 'Test Pipeline 1',
        associated_team_id: null,
        definition_json: '{}',
        enabled: 1,
        created_at: 1000,
        updated_at: 1000,
      };

      mockPrepareInstance.get.mockReturnValue(mockPipeline);

      const service = PipelineService.getInstance();
      const result = await service.getPipeline('pl-1');

      expect(mockDriver.prepare).toHaveBeenCalledWith('SELECT * FROM devops_pipelines WHERE id = ?');
      expect(mockPrepareInstance.get).toHaveBeenCalledWith('pl-1');
      expect(result).toEqual(mockPipeline);
    });

    it('createPipeline should insert a new pipeline into the database', async () => {
      mockPrepareInstance.run.mockReturnValue({ changes: 1 });

      const service = PipelineService.getInstance();
      const definition = {
        stages: [
          {
            name: 'Lint',
            jobs: [
              {
                name: 'oxlint',
                commands: ['npm run lint'],
              },
            ],
          },
        ],
      };

      const result = await service.createPipeline({
        tenantId: 'default',
        name: 'New Pipeline',
        associatedTeamId: 'team-1',
        definition,
      });

      expect(result.id).toBeDefined();
      expect(result.name).toBe('New Pipeline');
      expect(result.associated_team_id).toBe('team-1');
      expect(result.definition_json).toBe(
        JSON.stringify({
          stages: [
            {
              name: 'Lint',
              enabled: true,
              jobs: [
                {
                  name: 'oxlint',
                  commands: ['npm run lint'],
                },
              ],
            },
          ],
        })
      );

      expect(mockDriver.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO devops_pipelines'));
      expect(mockPrepareInstance.run).toHaveBeenCalledWith(
        result.id,
        'default',
        'New Pipeline',
        'team-1',
        result.definition_json,
        1,
        expect.any(Number),
        expect.any(Number)
      );
    });

    it('createPipeline should normalize flat editor stages into stage jobs and commands', async () => {
      mockPrepareInstance.run.mockReturnValue({ changes: 1 });

      const service = PipelineService.getInstance();
      const result = await service.createPipeline({
        tenantId: 'default',
        name: 'Editor Pipeline',
        definition: {
          stages: [
            {
              name: 'Lint',
              command: 'npm run lint\nnpm run test',
              enabled: true,
            },
          ],
        } as any,
      });

      expect(result.definition_json).toBe(
        JSON.stringify({
          stages: [
            {
              name: 'Lint',
              enabled: true,
              jobs: [
                {
                  name: 'Lint',
                  commands: ['npm run lint', 'npm run test'],
                },
              ],
            },
          ],
        })
      );
    });

    it('updatePipeline should update an existing pipeline instead of inserting a new one', async () => {
      const existingPipeline = {
        id: 'pl-1',
        tenant_id: 'default',
        name: 'Old Pipeline',
        associated_team_id: null,
        definition_json: '{}',
        enabled: 1,
        created_at: 1000,
        updated_at: 1000,
      };

      mockPrepareInstance.get.mockReturnValue(existingPipeline);
      mockPrepareInstance.run.mockReturnValue({ changes: 1 });

      const service = PipelineService.getInstance();
      const result = await (service as any).updatePipeline({
        tenantId: 'default',
        pipelineId: 'pl-1',
        name: 'Updated Pipeline',
        definition: {
          stages: [
            {
              name: 'Build',
              command: 'npm run build',
              enabled: true,
            },
          ],
        },
      });

      expect(mockDriver.prepare).toHaveBeenCalledWith(expect.stringContaining('UPDATE devops_pipelines'));
      expect(result.id).toBe('pl-1');
      expect(result.name).toBe('Updated Pipeline');
      expect(result.definition_json).toBe(
        JSON.stringify({
          stages: [
            {
              name: 'Build',
              enabled: true,
              jobs: [
                {
                  name: 'Build',
                  commands: ['npm run build'],
                },
              ],
            },
          ],
        })
      );
    });
  });

  describe('Pipeline Execution', () => {
    it('triggerPipelineRun should setup runs, spawn child process, capture output, and update run status to success on zero exit code', async () => {
      const mockPipeline = {
        id: 'pl-1',
        tenant_id: 'default',
        name: 'Test Pipeline',
        associated_team_id: null,
        definition_json: JSON.stringify({
          stages: [
            {
              name: 'Lint',
              jobs: [
                {
                  name: 'oxlint',
                  commands: ['npm run lint'],
                },
              ],
            },
          ],
        }),
        enabled: 1,
        created_at: 1000,
        updated_at: 1000,
      };

      // Mock getting the pipeline
      mockPrepareInstance.get.mockReturnValue(mockPipeline);
      mockPrepareInstance.run.mockReturnValue({ changes: 1 });

      const service = PipelineService.getInstance();
      const runIdPromise = service.triggerPipelineRun('pl-1', 'user-1', 'manual');

      // Fast-forward so that the background run triggers and starts executing command
      await vi.runAllTimersAsync();

      const runId = await runIdPromise;
      expect(runId).toBeDefined();

      // Verify that the run record was initialized in DB
      expect(mockDriver.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO devops_pipeline_runs'));

      // Verify child process spawn was triggered
      expect(spawn).toHaveBeenCalled();

      // Simulate output streaming from command
      mockStdout.emit('data', Buffer.from('Linting files...\n'));
      mockStderr.emit('data', Buffer.from('Warning: potential issue on line 10\n'));

      // Simulate command completion (success)
      mockChildProcess.emit('close', 0);

      // Advance timers to trigger throttled log flush
      vi.advanceTimersByTime(500);
      await vi.runAllTimersAsync();

      // Verify that the final success update was written
      expect(mockPrepareInstance.run).toHaveBeenCalledWith('success', expect.any(Number), expect.any(Number), runId);
    });

    it('triggerPipelineRun should set status to failed if command returns non-zero code', async () => {
      const mockPipeline = {
        id: 'pl-1',
        tenant_id: 'default',
        name: 'Test Pipeline',
        associated_team_id: null,
        definition_json: JSON.stringify({
          stages: [
            {
              name: 'Lint',
              jobs: [
                {
                  name: 'oxlint',
                  commands: ['npm run lint'],
                },
              ],
            },
          ],
        }),
        enabled: 1,
        created_at: 1000,
        updated_at: 1000,
      };

      // Mock getting the pipeline
      mockPrepareInstance.get.mockReturnValue(mockPipeline);
      mockPrepareInstance.run.mockReturnValue({ changes: 1 });

      const service = PipelineService.getInstance();
      const runId = await service.triggerPipelineRun('pl-1', 'user-1', 'manual');

      await vi.runAllTimersAsync();

      // Simulate command failure (exit code 1)
      mockChildProcess.emit('close', 1);

      // Advance timers
      vi.advanceTimersByTime(500);
      await vi.runAllTimersAsync();

      // Verify that the status failed update was written
      expect(mockPrepareInstance.run).toHaveBeenCalledWith('failed', expect.any(Number), expect.any(Number), runId);
    });
  });
});
