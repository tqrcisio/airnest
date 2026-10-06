import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { CONTROL_PLANE_OPTIONS, type ControlPlaneOptions } from './control-plane.module-definition.js';

@Injectable()
export class ControlPlaneGuard implements CanActivate {
  constructor(@Inject(CONTROL_PLANE_OPTIONS) private readonly options: ControlPlaneOptions) {}

  canActivate(context: ExecutionContext) {
    return this.options.authorize(context.switchToHttp().getRequest());
  }
}
