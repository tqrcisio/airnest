import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import { compileDag } from './compile-dag.js';
import { Dag } from './dag.decorator.js';
import { DagRegistry } from './dag.registry.js';

@Injectable()
export class DagExplorer implements OnModuleInit {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly registry: DagRegistry,
  ) {}

  onModuleInit() {
    for (const wrapper of this.discovery.getProviders({ metadataKey: Dag.KEY })) {
      const options = this.discovery.getMetadataByDecorator(Dag, wrapper)!;
      if (!wrapper.isDependencyTreeStatic()) {
        throw new Error(`DAG ${options.id} must be a singleton provider, without request-scoped dependencies`);
      }
      const methodNames = this.scanner.getAllMethodNames(Object.getPrototypeOf(wrapper.instance));
      this.registry.register(compileDag(options, wrapper.instance, methodNames));
    }
  }
}
