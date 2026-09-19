import { describe, expect, it } from 'vitest';
import { mergeBytes } from '../packages/mcp-server/src/pending';
import { extractBytes, stripBytes } from '../packages/ui/src/bridge/binary';

/**
 * 跨包二进制编解码 roundtrip。
 *
 * UI 侧把 bytes 从 meta 里剥出来走单独的 WS 二进制帧(`stripBytes` + `extractBytes`),
 * server 侧再回填回去(`mergeBytes`)。这是一对互逆编码,分居 `pending.ts` 与
 * `ui/src/bridge/binary.ts` 两个包 —— 任何一侧改名或改插入序,症状都只是
 * 「导出图是空的」,没有任何类型或编译信号。
 *
 * 放这里而不是任一包的 src 里:shared 不能反向依赖 ui,mcp-server 也不该依赖 ui。
 */
function exportPayload(ids: readonly string[]) {
  return {
    exports: Object.fromEntries(
      ids.map((id) => [
        id,
        {
          id,
          bytes: new Uint8Array([id.length, id.charCodeAt(0)]),
          mime: 'image/png',
        },
      ]),
    ),
  };
}

describe('二进制编解码 roundtrip', () => {
  it('多导出项:剥出顺序与回填顺序一致,结果逐字节相等', () => {
    const data = exportPayload(['1:2', '1:3', '1:4']);
    const meta = stripBytes(data);
    const bytes = extractBytes(data);

    expect(bytes).toHaveLength(3);

    const merged = mergeBytes(meta, bytes as unknown as Buffer[]) as {
      exports: Record<string, { bytes: Uint8Array; mime: string }>;
    };

    expect(Object.keys(merged.exports)).toEqual(['1:2', '1:3', '1:4']);
    expect(merged.exports['1:2'].bytes).toEqual(new Uint8Array([3, 49]));
    expect(merged.exports['1:3'].bytes).toEqual(new Uint8Array([3, 49]));
    expect(merged.exports['1:4'].bytes).toEqual(new Uint8Array([3, 49]));
    expect(merged.exports['1:4'].mime).toBe('image/png');
  });

  it('meta 帧里不含 bytes —— 否则二进制会被 JSON 序列化成 {0:..,1:..} 进文本帧', () => {
    const meta = stripBytes(exportPayload(['1:2'])) as Record<string, unknown>;
    expect(JSON.stringify(meta)).not.toContain('bytes');
    expect(extractBytes(meta)).toHaveLength(0);
  });

  it('单帧 bytes 形态:{bytes} 顶层对象也要能回填', () => {
    const data = { bytes: new Uint8Array([1, 2, 3]) };
    const merged = mergeBytes(
      stripBytes(data),
      extractBytes(data) as unknown as Buffer[],
    ) as { bytes: Uint8Array };
    expect(merged.bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('非对象 data:直接返回裸帧,不包一层假结构', () => {
    const single = new Uint8Array([9]) as unknown as Buffer;
    expect(mergeBytes(null, [single])).toBe(single);
  });
});
