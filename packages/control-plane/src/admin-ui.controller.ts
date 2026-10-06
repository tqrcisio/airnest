import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Controller, Get, Inject, NotFoundException, Param, StreamableFile } from '@nestjs/common';
import { CONTROL_PLANE_PATH } from './constants.js';

const adminDir = fileURLToPath(new URL('../admin', import.meta.url));

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json',
};

async function isFile(path: string) {
  return (await stat(path).catch(() => null))?.isFile() ?? false;
}

export function adminRoutePrefix(path: string) {
  return `/${path.replace(/^\/+|\/+$/g, '')}`;
}

@Controller('ui')
export class AdminUiController {
  private indexHtml?: Promise<string>;

  constructor(@Inject(CONTROL_PLANE_PATH) private readonly path: string) {}

  @Get()
  index() {
    return this.page();
  }

  @Get('*asset')
  async asset(@Param('asset') asset: string | string[]) {
    const relative = normalize(Array.isArray(asset) ? asset.join('/') : asset).replace(/^(\.\.(\/|\\|$))+/, '');
    const file = join(adminDir, relative);
    if (relative && file.startsWith(adminDir) && extname(file) && (await isFile(file))) {
      return new StreamableFile(await readFile(file), {
        type: contentTypes[extname(file)] ?? 'application/octet-stream',
      });
    }
    return this.page();
  }

  private async page() {
    if (!(await isFile(join(adminDir, 'index.html')))) {
      throw new NotFoundException('The admin was not built into this package');
    }
    this.indexHtml ??= this.renderIndex();
    return new StreamableFile(Buffer.from(await this.indexHtml), { type: contentTypes['.html'] });
  }

  private async renderIndex() {
    const apiBase = adminRoutePrefix(this.path);
    const basePath = `${apiBase}/ui/`;
    const config = JSON.stringify({ apiBase, basePath }).replace(/</g, '\\u003c');
    const html = await readFile(join(adminDir, 'index.html'), 'utf8');
    return html.replace('<head>', `<head><base href="${basePath}" /><script>window.__AIRNEST__ = ${config};</script>`);
  }
}
