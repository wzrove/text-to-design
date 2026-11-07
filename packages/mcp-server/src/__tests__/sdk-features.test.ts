import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { Bridge } from '../bridge';
import { MAX_TOOL_INPUT_ELEMENTS } from '../config';
import { createMcpI18n } from '../i18n';
import { buildServer } from '../server';
import { RECIPE_INDEX_URI } from '../tools/recipe-catalog';

/**
 * SDK 2.4 目录能力位的守卫:图标 / 入参总量上限 / 参数补全 / 资源级缓存。
 *
 * 这四项的共同点是「加错了不报错」—— 图标传错字段、上限写成 Infinity、
 * 补全回调漏绑、cacheHint 挂错层,`tools/list` 与 `listResources` 都照常成功,
 * 只有客户端行为悄悄退化。所以每条都尽量断言**客户端实际收到的目录**。
 */
async function withServer<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const server = buildServer(new Bridge(), createMcpI18n('zh-CN'));
  const client = new Client(
    { name: 'sdk-features', version: '1' },
    { capabilities: {} },
  );
  await server.connect(serverTransport as never);
  await client.connect(clientTransport as never);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

/**
 * 读私有的 `_registeredResources` —— cacheHint 不上线,只能看注册表。
 *
 * 键是**资源 URI**,值才是注册对象;`cacheHint` 挂在值上(普通键,
 * 不是符号键)。早先写过 `reg.find(r => r.uri === uri)`,而注册对象本身
 * 没有 `uri` 字段,于是永远取不到值 —— 断言恒为 0,测试却"通过"。
 */
function registeredResources(
  server: ReturnType<typeof buildServer>,
): { uri: string; cacheHint?: { ttlMs?: number; cacheScope?: string } }[] {
  const reg = (
    server as unknown as {
      _registeredResources: Record<
        string,
        { cacheHint?: { ttlMs?: number; cacheScope?: string } }
      >;
    }
  )._registeredResources;
  return Object.entries(reg ?? {}).map(([uri, r]) => ({
    uri,
    ...(r.cacheHint != null ? { cacheHint: r.cacheHint } : {}),
  }));
}

describe('SDK 2.4 目录能力', () => {
  it('每个工具都带协议合规的图标', async () => {
    await withServer(async (client) => {
      const { tools } = await client.listTools();
      expect(tools.length).toBeGreaterThan(40);
      for (const tool of tools) {
        expect(tool.icons?.length, `${tool.name} 没有图标`).toBeGreaterThan(0);
        for (const icon of tool.icons ?? []) {
          expect(icon.src).toMatch(/^data:image\/svg\+xml/);
          expect(icon.mimeType).toBe('image/svg+xml');
          // 图形来自 lucide-static:24×24 viewBox 与 2px 描边是它的固定口径,
          // 也是与 jsd_create_icon 默认参数对齐的依据
          const svg = decodeURIComponent(
            icon.src.replace(/^data:image\/svg\+xml;utf8,/, ''),
          );
          expect(svg, `${tool.name} 不是 lucide 口径的图标`).toContain(
            'viewBox="0 0 24 24"',
          );
          expect(svg).toContain('stroke-width="2"');
          // currentColor 在客户端没有上下文时各家解析不同,必须换成确定色值
          expect(svg, `${tool.name} 残留 currentColor`).not.toContain(
            'currentColor',
          );
          expect(svg).toMatch(/stroke="#[0-9A-Fa-f]{6}"/);
        }
      }
    });
  });

  it('工具图标按语义分族,不是全都同一个', async () => {
    await withServer(async (client) => {
      const { tools } = await client.listTools();
      const srcOf = (name: string) =>
        tools.find((t) => t.name === name)?.icons?.[0]?.src;
      // 建 / 查 / 导出 / 编排 四个族必须互不相同 —— 全一样等于没分
      const families = [
        srcOf('jsd_create_frame'),
        srcOf('jsd_find'),
        srcOf('jsd_export'),
        srcOf('jsd_batch'),
      ];
      expect(new Set(families).size, '图标族区分度不足').toBe(4);
      // 同族一致:两个 create 工具同图标
      expect(srcOf('jsd_create_frame')).toBe(srcOf('jsd_create_rectangle'));
    });
  });

  it('prompt 与 resource 也带图标', async () => {
    await withServer(async (client) => {
      const { prompts } = await client.listPrompts();
      expect(prompts.length).toBeGreaterThan(5);
      for (const p of prompts) {
        expect(p.icons?.length, `prompt ${p.name} 没有图标`).toBeGreaterThan(0);
      }

      const { resources } = await client.listResources();
      expect(resources.length).toBeGreaterThan(0);
      for (const r of resources) {
        expect(r.icons?.length, `resource ${r.uri} 没有图标`).toBeGreaterThan(
          0,
        );
      }
    });
  });

  it('入参总量有上限,且是有限的数', () => {
    // SDK 对 unset / Infinity 一律视为「无限制」,写回 Infinity 等于没配
    expect(MAX_TOOL_INPUT_ELEMENTS).toBeTypeOf('number');
    expect(Number.isFinite(MAX_TOOL_INPUT_ELEMENTS)).toBe(true);
    expect(MAX_TOOL_INPUT_ELEMENTS as number).toBeGreaterThan(1000);
  });

  it('配方资源模板的变量可补全', async () => {
    await withServer(async (client) => {
      const { resourceTemplates } = await client.listResourceTemplates();
      const recipe = resourceTemplates.find((t) =>
        String(t.uriTemplate).includes('/recipes/{'),
      );
      expect(recipe, '配方正文模板不在清单里').toBeTruthy();
      const ref = {
        type: 'ref/resource' as const,
        uri: recipe?.uriTemplate ?? '',
      };

      // 空串给全量候选
      const all = await client.complete({
        ref,
        argument: { name: 'id', value: '' },
      });
      expect(all.completion.values.length).toBeGreaterThan(5);
      expect(all.completion.values).toContain('chart-by-code');

      // 前缀过滤真的生效
      const filtered = await client.complete({
        ref,
        argument: { name: 'id', value: 'auto' },
      });
      expect(filtered.completion.values).toContain('auto-layout');
      expect(filtered.completion.values).not.toContain('chart-by-code');
    });
  });

  it('配方 prompt 的定点参数可补全', async () => {
    await withServer(async (client) => {
      const res = await client.complete({
        ref: { type: 'ref/prompt', name: 'variant-sync' },
        argument: { name: 'targetType', value: 'inst' },
      });
      expect(res.completion.values).toContain('INSTANCE');
      expect(res.completion.values).not.toContain('FRAME');
    });
  });

  /**
   * 资源级 cacheHint 是**注册期**选项:SDK 只在 `resources/read` 的结果上以符号
   * 字段挂着,再按客户端 era 决定是否投影到线上 —— 2025-era 连接读不到,
   * `listResources` 也不回。所以断言注册表本身,不断言线上报文。
   */
  it('只有低变化率的资源带缓存声明,画布事实恒不缓存', () => {
    const reg = registeredResources(buildServer(new Bridge()));
    const ttl = (uri: string): number =>
      reg.find((r) => r.uri === uri)?.cacheHint?.ttlMs ?? 0;

    // 字体与文档类:允许缓存
    expect(ttl('jsd://fonts'), 'jsd://fonts 应缓存').toBeGreaterThan(0);
    expect(ttl('jsd://styles'), 'jsd://styles 应缓存').toBeGreaterThan(0);
    expect(ttl('jsd://page'), 'jsd://page 应缓存').toBeGreaterThan(0);
    // 字体变化最慢,TTL 应长于文档类
    expect(ttl('jsd://fonts')).toBeGreaterThan(ttl('jsd://page'));

    // 此刻的事实:选中 / 平台态 —— 缓存即错
    for (const uri of ['jsd://canvas/selection', 'jsd://platform/state']) {
      expect(ttl(uri), `${uri} 不该声明缓存`).toBe(0);
    }

    // 配方索引是本地常量,读它不产生桥接往返,不需要缓存声明
    expect(ttl(RECIPE_INDEX_URI)).toBe(0);
  });
});
