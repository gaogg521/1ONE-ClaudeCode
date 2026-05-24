/**
 * @license
 * Copyright 2026 1ONE ClaudeCode
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDatabase } from '@process/services/database';
import { spawn } from 'child_process';

export interface IPipelineStageJob {
  name: string;
  commands: string[];
}

export interface IPipelineStage {
  name: string;
  jobs: IPipelineStageJob[];
}

export interface IPipelineDefinition {
  stages: IPipelineStage[];
}

export interface IPipeline {
  id: string;
  tenant_id: string;
  name: string;
  associated_team_id: string | null;
  definition_json: string;
  enabled: boolean;
  created_at: number;
  updated_at: number;
}

export interface IPipelineRun {
  id: string;
  pipeline_id: string;
  trigger_type: string;
  trigger_by: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  stages_status_json: string;
  log_content: string | null;
  duration_ms: number;
  created_at: number;
  finished_at: number | null;
}

class ThrottledLogger {
  private logBuffer = '';
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private runId: string,
    private dbDriver: any
  ) {}

  public append(text: string) {
    this.logBuffer += text;
    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.flush();
    }, 200);
  }

  public flush() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      this.dbDriver
        .prepare('UPDATE devops_pipeline_runs SET log_content = ? WHERE id = ?')
        .run(this.logBuffer, this.runId);
    } catch (err) {
      console.error('Failed to flush pipeline run logs to database', err);
    }
  }

  public getLog() {
    return this.logBuffer;
  }
}

export class PipelineService {
  private static instance: PipelineService | null = null;

  private constructor() {}

  public static getInstance(): PipelineService {
    if (!PipelineService.instance) {
      PipelineService.instance = new PipelineService();
    }
    return PipelineService.instance;
  }

  /**
   * Get all pipelines
   */
  public async getPipelines(tenantId = 'default'): Promise<IPipeline[]> {
    const db = await getDatabase();
    const driver = db.getDriver();
    const rows = driver
      .prepare('SELECT * FROM devops_pipelines WHERE tenant_id = ? ORDER BY created_at DESC')
      .all(tenantId) as IPipeline[];
    return rows;
  }

  /**
   * Get a pipeline by ID
   */
  public async getPipeline(pipelineId: string): Promise<IPipeline | null> {
    const db = await getDatabase();
    const driver = db.getDriver();
    const row = driver.prepare('SELECT * FROM devops_pipelines WHERE id = ?').get(pipelineId) as IPipeline | undefined;
    return row ?? null;
  }

  /**
   * Create a new pipeline
   */
  public async createPipeline(params: {
    tenantId?: string;
    name: string;
    associatedTeamId?: string | null;
    definition: IPipelineDefinition;
  }): Promise<IPipeline> {
    const db = await getDatabase();
    const driver = db.getDriver();
    const id = `pl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const tenantId = params.tenantId ?? 'default';
    const associatedTeamId = params.associatedTeamId ?? null;
    const definitionJson = JSON.stringify(params.definition);
    const now = Date.now();

    driver
      .prepare(
        `INSERT INTO devops_pipelines (id, tenant_id, name, associated_team_id, definition_json, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, tenantId, params.name, associatedTeamId, definitionJson, 1, now, now);

    return {
      id,
      tenant_id: tenantId,
      name: params.name,
      associated_team_id: associatedTeamId,
      definition_json: definitionJson,
      enabled: true,
      created_at: now,
      updated_at: now,
    };
  }

  /**
   * Get a pipeline run by ID
   */
  public async getPipelineRun(runId: string): Promise<IPipelineRun | null> {
    const db = await getDatabase();
    const driver = db.getDriver();
    const row = driver.prepare('SELECT * FROM devops_pipeline_runs WHERE id = ?').get(runId) as IPipelineRun | undefined;
    return row ?? null;
  }

  /**
   * Get pipeline runs for a pipeline
   */
  public async getPipelineRuns(pipelineId: string): Promise<IPipelineRun[]> {
    const db = await getDatabase();
    const driver = db.getDriver();
    const rows = driver
      .prepare('SELECT * FROM devops_pipeline_runs WHERE pipeline_id = ? ORDER BY created_at DESC')
      .all(pipelineId) as IPipelineRun[];
    return rows;
  }

  /**
   * Trigger a pipeline execution
   */
  public async triggerPipelineRun(
    pipelineId: string,
    triggerBy = 'system',
    triggerType = 'manual'
  ): Promise<string> {
    const pipeline = await this.getPipeline(pipelineId);
    if (!pipeline) {
      throw new Error(`Pipeline ${pipelineId} not found`);
    }

    if (!pipeline.enabled) {
      throw new Error(`Pipeline ${pipelineId} is disabled`);
    }

    const db = await getDatabase();
    const driver = db.getDriver();
    const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    let definition: IPipelineDefinition;
    try {
      definition = JSON.parse(pipeline.definition_json);
    } catch (err) {
      throw new Error(`Invalid pipeline definition JSON: ${err}`);
    }

    const stagesStatus = (definition.stages || []).map((stage) => ({
      name: stage.name,
      status: 'pending',
      started_at: null as number | null,
      finished_at: null as number | null,
      duration_ms: 0,
    }));

    const stagesStatusJson = JSON.stringify(stagesStatus);

    driver
      .prepare(
        `INSERT INTO devops_pipeline_runs (id, pipeline_id, trigger_type, trigger_by, status, stages_status_json, log_content, duration_ms, created_at)
         VALUES (?, ?, ?, ?, 'running', ?, '', 0, ?)`
      )
      .run(runId, pipelineId, triggerType, triggerBy, stagesStatusJson, now);

    // Spawn background execution runner
    this.runPipelineBackground(runId, pipeline, definition, stagesStatus).catch((err) => {
      console.error(`Unhandled error in background pipeline execution:`, err);
    });

    return runId;
  }

  private async runPipelineBackground(
    runId: string,
    pipeline: IPipeline,
    definition: IPipelineDefinition,
    stagesStatus: Array<{
      name: string;
      status: string;
      started_at: number | null;
      finished_at: number | null;
      duration_ms: number;
    }>
  ): Promise<void> {
    const db = await getDatabase();
    const driver = db.getDriver();
    const logger = new ThrottledLogger(runId, driver);
    const startTime = Date.now();

    logger.append(`Starting pipeline: ${pipeline.name} (Run ID: ${runId})\n`);
    logger.append(`Triggered at: ${new Date(startTime).toISOString()}\n\n`);

    let pipelineFailed = false;

    for (let i = 0; i < (definition.stages || []).length; i++) {
      const stage = definition.stages[i];
      const stageStatusObj = stagesStatus[i];

      if (pipelineFailed) {
        stageStatusObj.status = 'skipped';
        continue;
      }

      const stageStartTime = Date.now();
      stageStatusObj.status = 'running';
      stageStatusObj.started_at = stageStartTime;

      // Update stages_status_json in DB
      driver
        .prepare('UPDATE devops_pipeline_runs SET stages_status_json = ? WHERE id = ?')
        .run(JSON.stringify(stagesStatus), runId);

      logger.append(`>>> Stage [${stage.name}] started\n`);

      let stageFailed = false;

      for (const job of stage.jobs || []) {
        logger.append(`> Job [${job.name}] started\n`);

        for (const command of job.commands || []) {
          const exitCode = await this.executeCommand(command, logger);
          if (exitCode !== 0) {
            logger.append(`x Command [${command}] failed with exit code ${exitCode}\n`);
            stageFailed = true;
            break;
          } else {
            logger.append(`✓ Command [${command}] completed successfully\n`);
          }
        }

        if (stageFailed) {
          logger.append(`x Job [${job.name}] failed\n`);
          break;
        } else {
          logger.append(`✓ Job [${job.name}] finished successfully\n`);
        }
      }

      const stageEndTime = Date.now();
      stageStatusObj.finished_at = stageEndTime;
      stageStatusObj.duration_ms = stageEndTime - stageStartTime;

      if (stageFailed) {
        stageStatusObj.status = 'failed';
        pipelineFailed = true;
        logger.append(`>>> Stage [${stage.name}] failed (Duration: ${stageStatusObj.duration_ms}ms)\n\n`);
      } else {
        stageStatusObj.status = 'success';
        logger.append(`>>> Stage [${stage.name}] completed successfully (Duration: ${stageStatusObj.duration_ms}ms)\n\n`);
      }

      // Update stages_status_json in DB
      driver
        .prepare('UPDATE devops_pipeline_runs SET stages_status_json = ? WHERE id = ?')
        .run(JSON.stringify(stagesStatus), runId);
    }

    const endTime = Date.now();
    const durationMs = endTime - startTime;
    const finalStatus = pipelineFailed ? 'failed' : 'success';

    logger.append(`\nPipeline ${finalStatus === 'success' ? 'succeeded' : 'failed'}.\n`);
    logger.append(`Finished at: ${new Date(endTime).toISOString()}\n`);
    logger.append(`Total duration: ${durationMs}ms\n`);

    // Final flush of logs and status update
    logger.flush();

    driver
      .prepare(
        `UPDATE devops_pipeline_runs
         SET status = ?, duration_ms = ?, finished_at = ?
         WHERE id = ?`
      )
      .run(finalStatus, durationMs, endTime, runId);
  }

  private executeCommand(command: string, logger: ThrottledLogger): Promise<number> {
    return new Promise((resolve) => {
      const isWindows = process.platform === 'win32';
      const shellCmd = isWindows ? process.env.COMSPEC || 'cmd.exe' : 'sh';
      const shellArgs = isWindows ? ['/c', command] : ['-c', command];

      logger.append(`$ ${command}\n`);

      const child = spawn(shellCmd, shellArgs, {
        detached: !isWindows,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      child.stdout.on('data', (chunk: Buffer) => {
        logger.append(chunk.toString());
      });

      child.stderr.on('data', (chunk: Buffer) => {
        logger.append(chunk.toString());
      });

      child.on('error', (err) => {
        logger.append(`Error spawning command: ${err.message}\n`);
        resolve(-1);
      });

      child.on('close', (code) => {
        resolve(code ?? 0);
      });
    });
  }
}
