import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PostgresDagStore, TaskStillActiveError } from '@airnest/postgres';
import { CONTROL_PLANE_OPTIONS, type ControlPlaneOptions } from './control-plane.module-definition.js';
import { ControlPlaneGuard } from './control-plane.guard.js';

type ClearBody = { taskIds?: unknown; downstream?: unknown; onlyFailed?: unknown };

@Controller('runs')
@UseGuards(ControlPlaneGuard)
export class RunsController {
  private readonly clock: () => Date;

  constructor(
    private readonly store: PostgresDagStore,
    @Inject(CONTROL_PLANE_OPTIONS) private readonly options: ControlPlaneOptions,
  ) {
    this.clock = options.clock ?? (() => new Date());
  }

  @Get(':runId')
  async get(@Param('runId', ParseUUIDPipe) runId: string) {
    const run = await this.store.run(runId);
    if (!run) throw new NotFoundException(`Run ${runId} does not exist`);
    return run;
  }

  @Get(':runId/tasks/:taskId/attempts')
  async attempts(@Param('runId', ParseUUIDPipe) runId: string, @Param('taskId') taskId: string) {
    const run = await this.get(runId);
    if (!run.tasks.some((task) => task.taskId === taskId)) {
      throw new NotFoundException(`Run ${runId} has no task ${taskId}`);
    }
    return this.store.attempts(runId, taskId);
  }

  @Get(':runId/tasks/:taskId/logs')
  async logs(
    @Param('runId', ParseUUIDPipe) runId: string,
    @Param('taskId') taskId: string,
    @Query('after', new DefaultValuePipe(0), ParseIntPipe) after: number,
  ) {
    return this.store.logs(runId, taskId, after);
  }

  @Post(':runId/clear')
  @HttpCode(200)
  async clear(
    @Param('runId', ParseUUIDPipe) runId: string,
    @Body() body: ClearBody | undefined,
    @Req() request: unknown,
  ) {
    if (
      body?.taskIds !== undefined &&
      !(Array.isArray(body.taskIds) && body.taskIds.every((id) => typeof id === 'string'))
    ) {
      throw new BadRequestException('taskIds must be a list of task ids');
    }
    try {
      const cleared = await this.store.clearRun(
        runId,
        {
          taskIds: body?.taskIds as string[] | undefined,
          downstream: body?.downstream !== false,
          onlyFailed: body?.onlyFailed === true,
          clearedBy: this.options.resolveUser?.(request),
        },
        this.clock(),
      );
      if (!cleared) throw new NotFoundException(`Run ${runId} does not exist`);
      return { cleared };
    } catch (error) {
      if (error instanceof TaskStillActiveError) throw new ConflictException(error.message);
      if (error instanceof Error && error.message.includes('has no task')) throw new NotFoundException(error.message);
      throw error;
    }
  }
}
