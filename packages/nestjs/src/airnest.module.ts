import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { PostgresDagStore } from '@airnest/postgres';
import { AIRNEST_OPTIONS, ConfigurableModuleClass, type AirnestModuleOptions } from './airnest.module-definition.js';
import { AirnestRuntime } from './airnest.runtime.js';
import { Airnest } from './airnest.service.js';
import { DagExplorer } from './dag.explorer.js';
import { DagRegistry } from './dag.registry.js';
import { TaskExecutor } from './task-executor.js';

@Module({
  imports: [DiscoveryModule],
  providers: [
    {
      provide: PostgresDagStore,
      useFactory: (options: AirnestModuleOptions) => new PostgresDagStore(options.db),
      inject: [AIRNEST_OPTIONS],
    },
    DagRegistry,
    DagExplorer,
    TaskExecutor,
    AirnestRuntime,
    Airnest,
  ],
  exports: [DagRegistry, Airnest],
})
export class AirnestModule extends ConfigurableModuleClass {}
