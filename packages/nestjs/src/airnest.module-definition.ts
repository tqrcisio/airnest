import { ConfigurableModuleBuilder } from '@nestjs/common';
import type { SqlClient } from '@airnest/postgres';

export type AirnestModuleOptions = {
  db: SqlClient;
  migrate?: boolean;
  scheduler?: { enabled?: boolean; pollMs?: number };
  worker?: { enabled?: boolean; id?: string; concurrency?: number; pollMs?: number; leaseMs?: number };
  pools?: Record<string, number | { slots: number; description?: string }>;
  retention?: { days: number };
  enhancers?: boolean;
  shutdownTimeoutMs?: number;
  clock?: () => Date;
};

export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN: AIRNEST_OPTIONS } =
  new ConfigurableModuleBuilder<AirnestModuleOptions>().setClassMethodName('forRoot').build();
