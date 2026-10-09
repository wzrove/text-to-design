import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';
import { Bridge } from '../bridge';
import { createMcpI18n } from '../i18n';
import { buildServer } from '../server';

/**
 * instructions 里的配方导航是**手写清单**,配方真源却是 `tools/prompts.ts` 的注册表
 * —— 两份。手写那份没有守卫就会漏:新加一条配方、忘了回填导航,症状是模型压根不知道
 * 它存在(静默,没人会为此开 bug)。
 *
 * 故拿真注册表当判据(0005):listPrompts 报出的每个名字都必须在 instructions 里被点名。
 * 只查「有没有点名」,不查顺序与措辞 —— 导航怎么组织是作者的判断,不该被测试钉死。
 */
describe('mcp.instructions 的配方导航', () => {
  it('注册表里的每条配方都被点名(加 prompt 必须回填导航)', async () => {
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const server = buildServer(new Bridge(), createMcpI18n('zh-CN'));
    const client = new Client(
      { name: 'instructions-routing', version: '1' },
      { capabilities: {} },
    );
    await server.connect(serverTransport as never);
    await client.connect(clientTransport as never);
    try {
      const { prompts } = await client.listPrompts();
      const instructions = client.getInstructions() ?? '';
      expect(prompts.length).toBeGreaterThan(0);

      const missing = prompts
        .map((prompt) => prompt.name)
        .filter((name) => !instructions.includes(name));
      expect(
        missing,
        `这些配方没写进 mcp.instructions:${missing.join(' / ')}`,
      ).toEqual([]);
    } finally {
      await client.close();
    }
  });
});
