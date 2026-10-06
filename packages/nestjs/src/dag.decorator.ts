import { DiscoveryService } from '@nestjs/core';
import type { TaskSettings } from '@airnest/core';

export type DagOptions = {
  id: string;
  schedule?: string | null;
  timezone?: string;
  startDate?: Date | string;
  catchup?: boolean;
  maxActiveRuns?: number;
  tags?: string[];
  params?: Record<string, unknown>;
  defaults?: Partial<TaskSettings>;
};

export const Dag = DiscoveryService.createDecorator<DagOptions>();
