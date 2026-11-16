import {
  CODE_ROLES,
  type CodeRole,
  DESIGN_TO_CODE_SKILL_ROUTE,
  NODE_REFERENCE_VERSION,
} from './dicts/node-reference';
import {
  type CopyRequest,
  copyRequestSchema,
  pluginPlatformSchema,
  type PluginPlatform,
} from './schemas';

export function normalizeCodeRoles(values: readonly unknown[]): CodeRole[] {
  if (values.length === 0) throw new Error('code Copy 至少选择 frontend 或 backend');
  const unknown = values.filter(
    (value) =>
      typeof value !== 'string' ||
      !(CODE_ROLES as readonly string[]).includes(value),
  );
  if (unknown.length > 0) {
    throw new Error('不支持的 code 职责: ' + unknown.map(String).join(', '));
  }
  return CODE_ROLES.filter((role) => values.includes(role));
}

export interface NodeReference {
  version: typeof NODE_REFERENCE_VERSION;
  mode: CopyRequest['mode'];
  roles: CodeRole[];
  skill: typeof DESIGN_TO_CODE_SKILL_ROUTE.skillId | null;
  scope: CopyRequest['scope'];
  requestedIds: string[];
  source: {
    platform: PluginPlatform;
    pageName: string;
    selectionSeq: number | null;
  };
}

function requiredSource(request: CopyRequest): NodeReference['source'] {
  if (request.source.platform == null) {
    throw new Error('缺少平台信息，无法生成稳定节点引用');
  }
  const pageName = request.source.pageName?.trim();
  if (!pageName) throw new Error('缺少页面信息，无法生成稳定节点引用');
  return {
    platform: request.source.platform,
    pageName,
    selectionSeq: request.source.selectionSeq,
  };
}

export function buildNodeReference(rawRequest: CopyRequest): string {
  const request = copyRequestSchema.parse(rawRequest);
  const source = requiredSource(request);
  const roles = request.mode === 'code' ? normalizeCodeRoles(request.roles) : [];
  const url =
    request.scope === 'node'
      ? new URL('jsd://node/' + encodeURIComponent(request.requestedIds[0]!))
      : new URL('jsd://canvas/selection');
  url.searchParams.set('v', String(NODE_REFERENCE_VERSION));
  url.searchParams.set('mode', request.mode);
  if (request.mode === 'code') {
    url.searchParams.set('roles', roles.join(','));
    url.searchParams.set('skill', DESIGN_TO_CODE_SKILL_ROUTE.skillId);
  }
  url.searchParams.set('platform', source.platform);
  url.searchParams.set('page', source.pageName);
  if (source.selectionSeq != null) {
    url.searchParams.set('seq', String(source.selectionSeq));
  }
  if (request.scope === 'selection') {
    for (const id of request.requestedIds) url.searchParams.append('id', id);
  }
  return url.toString();
}

function one(params: URLSearchParams, key: string): string {
  const values = params.getAll(key);
  if (values.length !== 1 || values[0] === '') {
    throw new Error('节点链接字段 ' + key + ' 必须且只能出现一次');
  }
  return values[0];
}

export function parseNodeReference(text: string): NodeReference {
  if (text.trim() !== text || /\s/.test(text)) {
    throw new Error('节点引用必须且只能包含一个 URL');
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error('节点引用 URL 无法解析');
  }
  if (url.protocol !== 'jsd:' || url.hash || url.username || url.password || url.port) {
    throw new Error('不支持的节点引用协议');
  }
  const allowed = new Set([
    'v',
    'mode',
    'roles',
    'skill',
    'platform',
    'page',
    'seq',
    'id',
  ]);
  for (const key of new Set(url.searchParams.keys())) {
    if (!allowed.has(key)) throw new Error('未知节点引用字段: ' + key);
  }
  if (one(url.searchParams, 'v') !== String(NODE_REFERENCE_VERSION)) {
    throw new Error('不支持的节点引用版本');
  }
  const rawMode = one(url.searchParams, 'mode');
  if (rawMode !== 'design' && rawMode !== 'code') {
    throw new Error('未知节点引用 mode');
  }
  const mode = rawMode as CopyRequest['mode'];
  let roles: CodeRole[] = [];
  if (mode === 'code') {
    const rawRoles = one(url.searchParams, 'roles');
    roles = normalizeCodeRoles(rawRoles.split(','));
    if (roles.join(',') !== rawRoles) {
      throw new Error('roles 必须去重并按 frontend/backend 排列');
    }
    if (one(url.searchParams, 'skill') !== DESIGN_TO_CODE_SKILL_ROUTE.skillId) {
      throw new Error('节点引用 skill 不匹配');
    }
  } else if (url.searchParams.has('roles') || url.searchParams.has('skill')) {
    throw new Error('design 节点引用不得包含 roles/skill');
  }
  const platform = pluginPlatformSchema.parse(one(url.searchParams, 'platform'));
  const pageName = one(url.searchParams, 'page');
  const rawSeq = url.searchParams.has('seq')
    ? one(url.searchParams, 'seq')
    : null;
  const selectionSeq = rawSeq == null ? null : Number(rawSeq);
  if (
    selectionSeq != null &&
    (!Number.isSafeInteger(selectionSeq) || selectionSeq <= 0)
  ) {
    throw new Error('节点引用 seq 无效');
  }
  if (url.hostname === 'node') {
    if (url.searchParams.has('id')) throw new Error('单节点链接不得重复携带 id');
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length !== 1) throw new Error('单节点链接路径无效');
    let id: string;
    try {
      id = decodeURIComponent(parts[0]!);
    } catch {
      throw new Error('节点 ID 编码无效');
    }
    if (!id) throw new Error('节点 ID 为空');
    return {
      version: NODE_REFERENCE_VERSION,
      mode,
      roles,
      skill: mode === 'code' ? DESIGN_TO_CODE_SKILL_ROUTE.skillId : null,
      scope: 'node',
      requestedIds: [id],
      source: { platform, pageName, selectionSeq },
    };
  }
  if (url.hostname === 'canvas' && url.pathname === '/selection') {
    const requestedIds = url.searchParams.getAll('id');
    if (
      requestedIds.length === 0 ||
      requestedIds.some((id) => !id) ||
      new Set(requestedIds).size !== requestedIds.length
    ) {
      throw new Error('整组节点链接 id 缺失或重复');
    }
    return {
      version: NODE_REFERENCE_VERSION,
      mode,
      roles,
      skill: mode === 'code' ? DESIGN_TO_CODE_SKILL_ROUTE.skillId : null,
      scope: 'selection',
      requestedIds,
      source: { platform, pageName, selectionSeq },
    };
  }
  throw new Error('未知节点引用资源路径');
}
