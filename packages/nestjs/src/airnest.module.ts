import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { DagExplorer } from './dag.explorer.js';
import { DagRegistry } from './dag.registry.js';

@Module({
  imports: [DiscoveryModule],
  providers: [DagRegistry, DagExplorer],
  exports: [DagRegistry],
})
export class AirnestModule {}
