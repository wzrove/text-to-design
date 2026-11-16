import { z } from 'zod';
import { CODE_ROLES } from '../dicts/node-reference';
import { observedNodeTypeSchema } from './node-type';
import { pluginPlatformSchema } from './platform';

export const codeRoleSchema = z.enum(CODE_ROLES);

export const selectionMetaSchema = z.object({
  platform: pluginPlatformSchema,
  observedAt: z.string().min(1),
  selectionSeq: z.number().int().positive().nullable(),
});

export type SelectionMeta = z.infer<typeof selectionMetaSchema>;

export const copyTargetSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  type: observedNodeTypeSchema,
  width: z.number().optional(),
  height: z.number().optional(),
});

export const selectionSummaryDataSchema = z.object({
  selection: z.array(copyTargetSummarySchema),
  pageName: z.string(),
});

export type SelectionSummaryData = z.infer<typeof selectionSummaryDataSchema>;

export interface SelectionSummarySnapshot {
  data: SelectionSummaryData | null;
  meta?: SelectionMeta;
}

const copySourceSchema = z.object({
  platform: pluginPlatformSchema.nullable(),
  pageName: z.string().nullable(),
  selectionSeq: z.number().int().positive().nullable(),
});

const copyRequestFields = {
  scope: z.enum(['selection', 'node']),
  requestedIds: z.array(z.string().min(1)).min(1),
  source: copySourceSchema,
};

export const copyRequestSchema = z
  .discriminatedUnion('mode', [
    z.object({ mode: z.literal('design'), ...copyRequestFields }),
    z.object({
      mode: z.literal('code'),
      roles: z.array(codeRoleSchema).min(1),
      ...copyRequestFields,
    }),
  ])
  .superRefine((request, ctx) => {
    if (request.scope === 'node' && request.requestedIds.length !== 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['requestedIds'],
        message: 'node scope 必须且只能包含一个 requestedId',
      });
    }
    if (new Set(request.requestedIds).size !== request.requestedIds.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['requestedIds'],
        message: 'requestedIds 不得重复',
      });
    }
  });

export type CopyRequest = z.infer<typeof copyRequestSchema>;

export const copyRequestFrameSchema = z.object({
  type: z.literal('request'),
  id: z.string().min(1),
  method: z.literal('jsd_copy'),
  params: copyRequestSchema,
});

export type CopyRequestFrame = z.infer<typeof copyRequestFrameSchema>;

export function isCopyRequestFrame(
  value: unknown,
): value is { type: 'request'; id: string; method: 'jsd_copy'; params: unknown } {
  if (value == null || typeof value !== 'object') return false;
  const frame = value as Record<string, unknown>;
  return (
    frame.type === 'request' &&
    typeof frame.id === 'string' &&
    frame.method === 'jsd_copy'
  );
}

export const copyResultSchema = z.object({ text: z.string() });
export type CopyResult = z.infer<typeof copyResultSchema>;
