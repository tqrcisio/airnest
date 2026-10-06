import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService, ExternalContextCreator, MetadataScanner } from '@nestjs/core';
import { AIRNEST_OPTIONS, type AirnestModuleOptions } from './airnest.module-definition.js';
import { compileDag, type TaskInvoker, type WrapTask } from './compile-dag.js';
import { Dag } from './dag.decorator.js';
import { DagRegistry } from './dag.registry.js';

@Injectable()
export class DagExplorer implements OnModuleInit {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly registry: DagRegistry,
    private readonly externalContextCreator: ExternalContextCreator,
    @Inject(AIRNEST_OPTIONS) private readonly options: AirnestModuleOptions,
  ) {}

  onModuleInit() {
    for (const wrapper of this.discovery.getProviders({ metadataKey: Dag.KEY })) {
      const options = this.discovery.getMetadataByDecorator(Dag, wrapper)!;
      if (!wrapper.isDependencyTreeStatic()) {
        throw new Error(`DAG ${options.id} must be a singleton provider, without request-scoped dependencies`);
      }
      const methodNames = this.scanner.getAllMethodNames(Object.getPrototypeOf(wrapper.instance));
      const wrap = this.options.enhancers ? this.withEnhancers(wrapper.instance) : undefined;
      this.registry.register(compileDag(options, wrapper.instance, methodNames, wrap));
    }
  }

  private withEnhancers(instance: Record<string, Function>): WrapTask {
    return (methodName, invoke) => {
      const handler = (ctx: Parameters<TaskInvoker>[0]) => invoke(ctx);
      const method = instance[methodName];
      for (const key of Reflect.getMetadataKeys(method)) {
        Reflect.defineMetadata(key, Reflect.getMetadata(key, method), handler);
      }
      return this.externalContextCreator.create(
        instance,
        handler as (...args: unknown[]) => unknown,
        methodName,
        undefined,
        undefined,
        undefined,
        undefined,
        { guards: true, interceptors: true, filters: true },
        'airnest',
      );
    };
  }
}
