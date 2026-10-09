import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { Bridge } from '../bridge';
import { createMcpI18n } from '../i18n';
import { buildServer } from '../server';
import {
  RECIPE_INDEX_URI,
  RECIPE_URI_TEMPLATE,
  RECIPES,
} from '../tools/recipe-catalog';

/**
 * 配方资源的守卫(背景见 `tools/recipe-catalog.ts`)。
 *
 * 要守的是**闭环**,不是某个字符串:
 * 1. 目录与 prompt 注册表必须一一对应 —— 两份清单漂开,症状是模型读到一个不存在的
 *    配方、或某条配方谁都够不着(静默,和 instructions-routing 同一个失效模式);
 * 2. 工具描述里那个指针必须是**可执行的资源 URI**。曾经的写法是「完整配方见 prompt
 *    `chart-by-code`」—— 对模型来说 prompt 不是它能调的东西,等于把指针丢进死路;
 * 3. 配方资源不得依赖插件连接:资源是插件离线时唯一还能用的通路,若它顺手去读画布
 *    就一起废了。
 */
async function withServer<T>(
  fn: (client: Client) => Promise<T>,
  bridge: Bridge = new Bridge(),
): Promise<T> {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const server = buildServer(bridge, createMcpI18n('zh-CN'));
  const client = new Client(
    { name: 'recipe-resource', version: '1' },
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

describe('配方资源', () => {
  it('目录与 prompt 注册表一一对应', async () => {
    await withServer(async (client) => {
      const { prompts } = await client.listPrompts();
      const promptNames = prompts.map((p) => p.name).sort();
      const recipeIds = RECIPES.map((r) => r.id).sort();

      expect(
        promptNames.filter((n) => !recipeIds.includes(n)),
        '这些 prompt 没有对应的资源条目 —— 模型只能靠用户手动触发斜杠命令',
      ).toEqual([]);
      expect(
        recipeIds.filter((n) => !promptNames.includes(n)),
        '这些资源条目没有对应的 prompt —— whenToUse 里的 id 是编的',
      ).toEqual([]);
    });
  });

  it('索引与模板都在清单里,且索引描述自带路由表', async () => {
    await withServer(async (client) => {
      const { resources } = await client.listResources();
      const index = resources.find((r) => r.uri === RECIPE_INDEX_URI);
      expect(index, `listResources 里没有 ${RECIPE_INDEX_URI}`).toBeTruthy();
      // 这段是模型唯一能便宜拿到的路由表(宿主普遍不注入 mcp.instructions),
      // 必须点名每个 id,否则「只读索引就知道该读哪条」不成立
      for (const r of RECIPES) {
        expect(index?.description ?? '').toContain(r.id);
      }

      const { resourceTemplates } = await client.listResourceTemplates();
      expect(
        resourceTemplates.map((t) => String(t.uriTemplate)),
        '配方正文模板没在 listResourceTemplates 里',
      ).toContain(RECIPE_URI_TEMPLATE);
    });
  });

  it('索引正文可读且列出全部配方', async () => {
    await withServer(async (client) => {
      const { contents } = await client.readResource({ uri: RECIPE_INDEX_URI });
      const text = contents.map((c) => ('text' in c ? c.text : '')).join('\n');
      expect(text.length).toBeGreaterThan(200);
      for (const r of RECIPES) {
        expect(text, `索引漏了 ${r.id}`).toContain(r.uri);
      }
      expect(text).toContain('ReadMcpResource');
    });
  });

  /**
   * 参数可省的配方:prompt 与 resource 必须渲染出**同一份正文**。
   *
   * 这条是「单一真源」的实测判据 —— 谁哪天图省事在目录里另抄一份正文,这里立刻红。
   * 带必填参数的(chart-by-code / html-to-design / icon-grid)没法逐字比:
   * 资源那份用占位符渲染,只查非空与 mimeType。
   */
  const ARGLESS_IDS = [
    'design-strategy',
    'script-ops',
    'text-replace-strategy',
    'variant-sync',
    'variable-binding',
    'variant-set',
    'component-property',
  ];

  it('每条配方都有正文;参数可省的配方与 prompt 逐字同源', async () => {
    await withServer(async (client) => {
      for (const r of RECIPES) {
        const { contents } = await client.readResource({ uri: r.uri });
        const text = contents.map((c) => ('text' in c ? c.text : '')).join('');
        expect(text.length, `${r.id} 的正文为空,像是没渲染`).toBeGreaterThan(
          100,
        );
        expect(text, `${r.id} 回的是 URI 而不是正文`).not.toBe(r.uri);
        expect(
          contents[0]?.mimeType,
          `${r.id} 的 mimeType 应为 text/markdown`,
        ).toBe('text/markdown');

        if (!ARGLESS_IDS.includes(r.id)) continue;
        // 空对象而非缺省:SDK 的 argsSchema 是 object 时,undefined 会被判为非法入参
        const { messages } = await client.getPrompt({
          name: r.id,
          arguments: {},
        });
        const promptText = messages
          .map((m) => {
            const content = m.content as { type?: string; text?: string };
            return content.type === 'text' ? (content.text ?? '') : '';
          })
          .join('');
        expect(
          text,
          `${r.id} 的两条通路正文不一致 —— 有人又抄了一份,没走 render 函数`,
        ).toBe(promptText);
      }
    });
  });

  it('打错 id 时把可用清单带回去(一次自我纠正,不必再读索引)', async () => {
    await withServer(async (client) => {
      await expect(
        client.readResource({ uri: 'jsd://recipes/does-not-exist' }),
      ).rejects.toThrowError(/未知配方/);
      await expect(
        client.readResource({ uri: 'jsd://recipes/does-not-exist' }),
      ).rejects.toThrowError(/chart-by-code/);
    });
  });

  it('插件离线也能读(不碰画布)', async () => {
    // Bridge 未连接任何插件:任何一次请求都会抛。配方资源若顺手读了画布,这条会红
    const offline = new Bridge();
    await withServer(async (client) => {
      const { contents } = await client.readResource({
        uri: 'jsd://recipes/chart-by-code',
      });
      const text = contents.map((c) => ('text' in c ? c.text : '')).join('');
      expect(text).toContain('# 用代码画图表');
    }, offline);
  });

  it('工具描述里的指针是可执行的资源 URI,不是 prompt 名', async () => {
    await withServer(async (client) => {
      const { tools } = await client.listTools();
      const createSvg = tools.find((t) => t.name === 'jsd_create_svg');
      expect(createSvg).toBeTruthy();
      const description = createSvg?.description ?? '';
      expect(
        description,
        'jsd_create_svg 的描述必须给出模型能自己执行的动作(读资源)',
      ).toContain('jsd://recipes/chart-by-code');
      // 关键硬约束要落在描述里:模型不读资源也不会踩静默失败
      for (const rule of ['viewBox', 'hex', '2000×2000', '<g id>']) {
        expect(description, `描述漏了引擎硬约束:${rule}`).toContain(rule);
      }

      const batch = tools.find((t) => t.name === 'jsd_batch');
      expect(
        batch?.description ?? '',
        'jsd_batch 是多步编排的主入口,应指向配方索引',
      ).toContain(RECIPE_INDEX_URI);
    });
  });
});
