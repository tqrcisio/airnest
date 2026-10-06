import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { PostgresDagStore } from '@airnest/postgres';
import { ControlPlaneGuard } from './control-plane.guard.js';

@Controller('runs')
@UseGuards(ControlPlaneGuard)
export class RunsController {
  constructor(private readonly store: PostgresDagStore) {}

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
}
