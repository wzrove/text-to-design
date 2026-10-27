import { describe, expect, it } from 'vitest';
import {
  errorGroupKey,
  normalizeErrorMessage,
} from '../packages/shared/src/dicts/error-report';

/**
 * 分组键的不变式:同一形状的错误必须得出同一个键,不同形状必须分开。
 * 它是客户端窗口内去重与服务端跨窗口 rollup 的**同一份**口径,两侧跑偏就是
 * 「客户端聚合了、服务端又拆开」这类静默错误(见 dec 1a135e6a 与本次结构化改造)。
 */
describe('errorGroupKey', () => {
  it('抹掉桥接请求号与耗时,同一失败收敛成一个键', () => {
    const a = errorGroupKey({
      scope: 'bridge',
      code: 'engine_error',
      subject: 'node_op',
      message: '响应: r1010 node_op ok=false 耗时=170ms error=engine_error',
    });
    const b = errorGroupKey({
      scope: 'bridge',
      code: 'engine_error',
      subject: 'node_op',
      message: '响应: r1049 node_op ok=false 耗时=68ms error=engine_error',
    });
    expect(a).toBe(b);
  });

  it('不同的类别 / 来源 / 方法不合并', () => {
    const base = {
      scope: 'bridge' as const,
      code: 'engine_error' as const,
      subject: 'node_op',
      message: '响应: r1 node_op ok=false 耗时=1ms error=engine_error',
    };
    expect(errorGroupKey(base)).not.toBe(
      errorGroupKey({ ...base, code: 'forward_timeout' }),
    );
    expect(errorGroupKey(base)).not.toBe(
      errorGroupKey({ ...base, subject: 'set_layout' }),
    );
    expect(errorGroupKey(base)).not.toBe(
      errorGroupKey({ ...base, scope: 'tool' }),
    );
  });

  it('数字本身不抹:HTTP 500 与 HTTP 404 是两条错误', () => {
    expect(normalizeErrorMessage('遥测上报失败: HTTP 500')).toBe(
      '遥测上报失败: HTTP 500',
    );
    expect(errorGroupKey({ message: '遥测上报失败: HTTP 500' })).not.toBe(
      errorGroupKey({ message: '遥测上报失败: HTTP 404' }),
    );
  });

  it('节点 id / uuid 归一,键里不塞 8KB 正文', () => {
    expect(normalizeErrorMessage('节点 1:23 不存在')).toBe('节点 <id> 不存在');
    const long = `x${'y'.repeat(9000)}`;
    expect(errorGroupKey({ message: long }).length).toBeLessThan(400);
  });

  it('缺 scope/code/subject 时退化成只按 message 分组', () => {
    expect(errorGroupKey({ message: 'boom' })).toBe('|||boom');
  });
});
