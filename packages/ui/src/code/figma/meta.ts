import type { PlatformMeta } from 'text-to-design-shared';
import { figmaOps } from './ops';

export const meta: PlatformMeta = {
  capabilities: [
    'styles',
    'textTruncation',
    'componentProperties',
    'variables',
    'getMainComponentAsync',
    'platformOps',
  ],
  platformOps: figmaOps,
};
