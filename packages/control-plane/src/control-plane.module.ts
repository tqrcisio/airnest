import { Module } from '@nestjs/common';
import { PostgresDagStore } from '@airnest/postgres';
import { ControlPlaneGuard } from './control-plane.guard.js';
import {
  CONTROL_PLANE_OPTIONS,
  ConfigurableModuleClass,
  type ControlPlaneOptions,
} from './control-plane.module-definition.js';
import { DagsController } from './dags.controller.js';
import { ManifestController, PoolsController } from './manifest.controller.js';
import { RunsController } from './runs.controller.js';

@Module({
  controllers: [ManifestController, DagsController, RunsController, PoolsController],
  providers: [
    {
      provide: PostgresDagStore,
      useFactory: (options: ControlPlaneOptions) => new PostgresDagStore(options.db),
      inject: [CONTROL_PLANE_OPTIONS],
    },
    ControlPlaneGuard,
  ],
})
export class AirnestControlPlaneModule extends ConfigurableModuleClass {}
