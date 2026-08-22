import { createServer } from 'node:http';
import {
  localhostHostValidation,
  localhostOriginValidation,
  toNodeHandler,
} from '@modelcontextprotocol/node';
import { createMcpHandler } from '@modelcontextprotocol/server';
import type { Bridge } from '../bridge';
import {
  DAEMON_POLL_MS,
  DAEMON_WAIT_MS,
  HTTP_PORT,
  PORT,
  SERVER_NAME,
  SERVER_VERSION,
} from '../config';
import { debug, error, log } from '../logger';
import { buildServer } from '../server';
import { delay, probeUpstream } from './probe';
import { serveProxy } from './proxy';
import { spawnDaemon } from './spawn';

export { spawnDaemon };

/** daemon 模式:WS 桥(插件) + HTTP MCP(各会话 shim 连接),无 stdio,常驻 */
export async function runDaemon(bridge: Bridge): Promise<void> {
  await bridge.start(PORT);
  log(`daemon: 插件 WS ws://localhost:${bridge.port}`);

  const handler = createMcpHandler(() => buildServer(bridge));
  const nodeHandler = toNodeHandler(handler);
  const validateHost = localhostHostValidation();
  const validateOrigin = localhostOriginValidation();
  let httpServer: ReturnType<typeof createServer> | null = null;

  const shutdown = (reason: string): void => {
    log(`daemon 退出: ${reason}`);
    void handler.close();
    bridge.stop();
    httpServer?.close();
    process.exit(0);
  };

  await new Promise<void>((resolve, reject) => {
    httpServer = createServer((req, res) => {
      if (!validateHost(req, res) || !validateOrigin(req, res)) return;
      const start = Date.now();
      const url = req.url ?? '';
      res.on('finish', () => {
        // 成功请求降为 debug:shim 轮询会周期性打出大量 200,避免刷屏;
        // 排查轮询节奏时开 TEXT_TO_DESIGN_MCP_LOG_LEVEL=debug 可见
        const line = `HTTP ${req.method} ${url} → ${res.statusCode} (${Date.now() - start}ms)`;
        if (res.statusCode >= 400) log(line);
        else debug(line);
      });
      if (req.method === 'GET' && url === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            name: SERVER_NAME,
            version: SERVER_VERSION,
            pid: process.pid,
          }),
        );
        return;
      }
      if (req.method === 'POST' && url === '/shutdown') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        setTimeout(() => shutdown('收到 /shutdown 请求'), 100);
        return;
      }
      void nodeHandler(req, res);
    });
    httpServer.once('error', reject);
    httpServer.listen(HTTP_PORT, '127.0.0.1', () => resolve());
  });

  log(`daemon: MCP HTTP http://127.0.0.1:${HTTP_PORT}/mcp`);
  log('daemon 就绪,常驻运行(更新时由版本自检自动替换)');

  process.on('SIGINT', () => shutdown('SIGINT'));
}

/** shim 模式:探测 daemon;无则拉起并等待就绪 */
export async function runShim(): Promise<void> {
  const probe = await probeUpstream();
  if (probe.state === 'foreign') {
    error(`端口 ${HTTP_PORT} 被非 text-to-design MCP 服务占用,请先释放`);
    process.exit(1);
  } else if (probe.state === 'proxy') {
    await serveProxy(probe.client);
    return;
  }

  log('未发现 daemon,自动拉起...');
  spawnDaemon();
  const deadline = Date.now() + DAEMON_WAIT_MS;
  while (Date.now() < deadline) {
    await delay(DAEMON_POLL_MS);
    const retry = await probeUpstream();
    if (retry.state === 'proxy') {
      await serveProxy(retry.client);
      return;
    }
    if (retry.state === 'foreign') {
      error(`端口 ${HTTP_PORT} 被非 text-to-design MCP 服务占用,请先释放`);
      process.exit(1);
    }
  }
  error(`daemon 启动超时(${DAEMON_WAIT_MS / 1000}s),请检查残留进程后重试`);
  process.exit(1);
}
