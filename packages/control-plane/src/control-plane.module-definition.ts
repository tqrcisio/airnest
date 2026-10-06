import { ConfigurableModuleBuilder } from '@nestjs/common';
import { RouterModule } from '@nestjs/core';
import type { SqlClient } from '@airnest/postgres';

export type ControlPlaneOptions = {
  db: SqlClient;
  authorize: (request: unknown) => boolean | Promise<boolean>;
  resolveUser?: (request: unknown) => string | undefined;
  clock?: () => Date;
};

export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN: CONTROL_PLANE_OPTIONS } =
  new ConfigurableModuleBuilder<ControlPlaneOptions>()
    .setClassMethodName('forRoot')
    .setExtras({ path: 'airnest' }, (definition, extras) => ({
      ...definition,
      imports: [
        ...(definition.imports ?? []),
        RouterModule.register([{ path: extras.path, module: definition.module }]),
      ],
    }))
    .build();
