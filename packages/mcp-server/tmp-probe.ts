import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';

const c = new Client(
  { name: 'probe', version: '0' },
  { versionNegotiation: { mode: 'auto' } },
);
await c.connect(
  new StreamableHTTPClientTransport(new URL('http://127.0.0.1:47820/mcp')),
);

async function call(name: string, args: Record<string, unknown> = {}) {
  const r = (await c.callTool({ name, arguments: args })) as any;
  const texts = (r.content ?? []).map((b: any) => b.text);
  let payload: any = texts.at(-1);
  try {
    payload = JSON.parse(payload);
  } catch {}
  return { isError: !!r.isError, blocks: texts.slice(0, -1), payload };
}
const says = (r: Awaited<ReturnType<typeof call>>) =>
  [...r.blocks, typeof r.payload === 'string' ? r.payload : ''].join(' | ');
const _marked = (r: Awaited<ReturnType<typeof call>>) =>
  r.blocks.length > 1 || r.isError;
const _node = async (id: string) =>
  (await call('jsd_find', { ids: [id] })).payload?.nodes?.[0];
const _mk = async (
  kind: 'FRAME' | 'RECTANGLE' | 'ELLIPSE' | 'TEXT',
  name: string,
) => {
  const tool = {
    FRAME: 'jsd_create_frame',
    RECTANGLE: 'jsd_create_rectangle',
    ELLIPSE: 'jsd_create_ellipse',
    TEXT: 'jsd_create_text',
  }[kind];
  const args: Record<string, unknown> = { name, width: 200, height: 120 };
  if (kind === 'TEXT') {
    args.characters = 'Hello';
    args.fontSize = 16;
  }
  const r = await call(tool, args);
  return (r.payload?.created?.[0]?.id ?? '') as string;
};
const _ok = (b: boolean) => (b ? 'PASS' : 'FAIL');

const p0 = await call('jsd_ping');
console.log('platform =', p0.payload.platform);

// ① 组件:按名查(排除「按 type 查不到」的假象)
for (const nm of ['CP-1', 'CP-2']) {
  const q = await call('jsd_find', { name: nm });
  const hits = (q.payload?.nodes ?? []).map(
    (n: any) => `${n.id}/${n.type}/${n.name}`,
  );
  console.log(`find name=${nm} →`, JSON.stringify(hits));
}
const cq = await call('jsd_find', { type: 'COMPONENT' });
console.log('find type=COMPONENT →', String(cq.payload).slice(0, 120));

// ② 文本:fontSize 是否触发未加载字体报错
for (const [label, args] of [
  [
    'characters + fontSize',
    { name: 'TY-1', width: 120, height: 40, characters: 'Hi', fontSize: 16 },
  ],
  [
    'characters 无 fontSize',
    { name: 'TY-2', width: 120, height: 40, characters: 'Hi' },
  ],
  [
    'characters + fontSize + fontName',
    {
      name: 'TY-3',
      width: 120,
      height: 40,
      characters: 'Hi',
      fontSize: 16,
      fontName: { family: 'Inter', style: 'Regular' },
    },
  ],
] as const) {
  const r = await call('jsd_create_text', args as Record<string, unknown>);
  console.log(
    `create_text ${label} → ${r.isError ? 'FAIL' : 'OK'} | ${says(r).replace(/\s+/g, ' ').slice(0, 130)}`,
  );
}

// ③ 修改路径:给已有文本改 fontSize 是否也报
const existing = ((await call('jsd_find', { name: 'TY-2' })).payload?.nodes ??
  [])[0];
if (existing) {
  const r = await call('jsd_set_text', { ids: [existing.id], fontSize: 24 });
  console.log(
    `set_text fontSize → ${r.isError ? 'FAIL' : 'OK'} | ${says(r).replace(/\s+/g, ' ').slice(0, 130)}`,
  );
}
