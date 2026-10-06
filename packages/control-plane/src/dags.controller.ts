import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
  DefaultValuePipe,
} from '@nestjs/common';
import { InvalidParamsError } from '@airnest/core';
import { PostgresDagStore } from '@airnest/postgres';
import { ControlPlaneGuard } from './control-plane.guard.js';
import { CONTROL_PLANE_OPTIONS, type ControlPlaneOptions } from './control-plane.module-definition.js';

type TriggerBody = { params?: unknown; logicalDate?: unknown };
type BackfillBody = { from?: unknown; to?: unknown; params?: unknown };

const maxPageSize = 200;

function parseParams(params: unknown = {}) {
  if (typeof params !== 'object' || params === null || Array.isArray(params)) {
    throw new BadRequestException('params must be an object');
  }
  return params as Record<string, unknown>;
}

function parseDate(value: unknown, field: string) {
  const date = new Date(String(value));
  if (value === undefined || Number.isNaN(date.getTime()))
    throw new BadRequestException(`${field} must be an ISO date`);
  return date;
}

function parseTrigger(body: TriggerBody | undefined, now: Date) {
  const logicalDate = body?.logicalDate === undefined ? now : parseDate(body.logicalDate, 'logicalDate');
  return { params: parseParams(body?.params), logicalDate };
}

async function rejectingInvalidParams<T>(work: Promise<T>) {
  try {
    return await work;
  } catch (error) {
    if (error instanceof InvalidParamsError) throw new BadRequestException(error.problems);
    throw error;
  }
}

@Controller('dags')
@UseGuards(ControlPlaneGuard)
export class DagsController {
  private readonly clock: () => Date;

  constructor(
    @Inject(CONTROL_PLANE_OPTIONS) private readonly options: ControlPlaneOptions,
    private readonly store: PostgresDagStore,
  ) {
    this.clock = options.clock ?? (() => new Date());
  }

  @Get()
  list() {
    return this.store.dags();
  }

  @Get(':dagId')
  async get(@Param('dagId') dagId: string) {
    const [dag] = await this.store.dags(dagId);
    if (!dag) throw new NotFoundException(`DAG ${dagId} is not registered`);
    return dag;
  }

  @Get(':dagId/runs')
  async runs(@Param('dagId') dagId: string, @Query('limit', new DefaultValuePipe(25), ParseIntPipe) limit: number) {
    await this.get(dagId);
    return this.store.runs(dagId, Math.min(Math.max(limit, 1), maxPageSize));
  }

  @Post(':dagId/runs')
  async trigger(@Param('dagId') dagId: string, @Body() body: TriggerBody | undefined, @Req() request: unknown) {
    await this.get(dagId);
    const now = this.clock();
    const { params, logicalDate } = parseTrigger(body, now);
    const runId = await rejectingInvalidParams(
      this.store.createRun(
        {
          dagId,
          logicalDate,
          dataInterval: { start: logicalDate, end: logicalDate },
          runType: 'manual',
          params,
          triggeredBy: this.options.resolveUser?.(request),
        },
        now,
      ),
    );
    if (!runId) throw new ConflictException(`DAG ${dagId} already has a run for ${logicalDate.toISOString()}`);
    return this.store.run(runId);
  }

  @Post(':dagId/backfills')
  async backfill(@Param('dagId') dagId: string, @Body() body: BackfillBody | undefined, @Req() request: unknown) {
    const [dag] = await this.store.dags(dagId);
    if (!dag) throw new NotFoundException(`DAG ${dagId} is not registered`);
    if (!dag.definition.schedule) throw new BadRequestException(`DAG ${dagId} has no schedule to backfill`);
    const from = parseDate(body?.from, 'from');
    const to = parseDate(body?.to, 'to');
    if (from > to) throw new BadRequestException('from must not be after to');

    try {
      return await rejectingInvalidParams(
        this.store.createBackfill(
          dagId,
          from,
          to,
          { params: parseParams(body?.params), triggeredBy: this.options.resolveUser?.(request) },
          this.clock(),
        ),
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes('limited to')) throw new BadRequestException(error.message);
      throw error;
    }
  }

  @Post(':dagId/pause')
  @HttpCode(204)
  async pause(@Param('dagId') dagId: string, @Req() request: unknown) {
    await this.setPaused(dagId, true, this.options.resolveUser?.(request) ?? null);
  }

  @Post(':dagId/unpause')
  @HttpCode(204)
  async unpause(@Param('dagId') dagId: string) {
    await this.setPaused(dagId, false, null);
  }

  private async setPaused(dagId: string, paused: boolean, by: string | null) {
    if (!(await this.store.setPaused(dagId, paused, by, this.clock()))) {
      throw new NotFoundException(`DAG ${dagId} is not registered`);
    }
  }
}
