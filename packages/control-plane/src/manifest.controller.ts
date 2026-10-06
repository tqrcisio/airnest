import { Controller, Get, UseGuards } from '@nestjs/common';
import { PostgresDagStore } from '@airnest/postgres';
import { ControlPlaneGuard } from './control-plane.guard.js';
import { buildManifest } from './manifest.js';

@Controller('manifest')
@UseGuards(ControlPlaneGuard)
export class ManifestController {
  constructor(private readonly store: PostgresDagStore) {}

  @Get()
  async get() {
    return buildManifest(await this.store.dags());
  }
}
