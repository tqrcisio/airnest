import { ConfigurableModuleBuilder } from '@nestjs/common';
import { RouterModule } from '@nestjs/core';
import type { SqlClient } from '@airnest/postgres';
import { AdminUiController } from './admin-ui.controller.js';
import { CONTROL_PLANE_PATH } from './constants.js';

export type ControlPlaneOptions = {
  db: SqlClient;
  authorize: (request: unknown) => boolean | Promise<boolean>;
  resolveUser?: (request: unknown) => string | undefined;
  clock?: () => Date;
};

export const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN: CONTROL_PLANE_OPTIONS } =
  new ConfigurableModuleBuilder<ControlPlaneOptions>()
    .setClassMethodName('forRoot')
    .setExtras({ path: 'airnest', ui: true }, (definition, extras) => ({
      ...definition,
      controllers: [...(definition.controllers ?? []), ...(extras.ui ? [AdminUiController] : [])],
      providers: [...(definition.providers ?? []), { provide: CONTROL_PLANE_PATH, useValue: extras.path }],
      imports: [
        ...(definition.imports ?? []),
        RouterModule.register([{ path: extras.path, module: definition.module }]),
      ],
    }))
    .build();
