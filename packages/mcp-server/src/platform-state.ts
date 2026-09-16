import {
  type CoreCapability,
  type HostCapability,
  PLATFORM_LABEL,
  type PlatformOpInfo,
  type PluginPlatform,
} from 'text-to-design-shared';
import type { Bridge } from './bridge';
import { PING_TIMEOUT_MS } from './config';
import { debug, log } from './logger';

/**
 * 插件上报的平台状态缓存(daemon 进程级,该进程内所有 MCP 会话共享)。
 *
 * 背景:平台唯一真源是插件对 ping 的回包(`{platform, capabilities, coreCapabilities,
 * platformOps}`),但此前只有调用方自己调 jsd_ping 时才拿得到 —— daemon 自己不知道
 * 连的是 jsDesign 还是 Figma,于是既没法按平台标注工具,也没法在调用必然失败的
 * 工具时提前给明确错误(要等插件侧报「平台不支持」)。
 *
 * 现在的生命周期:
 * - 插件上线 → bridge.onConnectionChange(true) → refreshPlatformState() 自动探测一次;
 * - 插件断开 → clearPlatformState() 清空(避免拿旧平台判断新连接);
 * - 探测失败/未探测 → state 保持 null,**所有平台判定 fail-open**(放行,交插件侧报错),
 *   绝不让"没探测到"变成"工具被静默禁用"。
 */
export interface PlatformState {
  platform: PluginPlatform;
  capabilities: readonly HostCapability[];
  coreCapabilities: readonly CoreCapability[];
  platformOps: readonly PlatformOpInfo[];
  /** 缓存时刻(ms);仅供日志与调试 */
  at: number;
}

/** 工具的平台归属声明(缺省=两平台通用) */
export interface PlatformScopedDef {
  name: string;
  platforms?: readonly PluginPlatform[];
  /** 平台差异说明:注册时拼进描述,平台不适用时作为替代路径提示 */
  platformNote?: string;
}

let state: PlatformState | null = null;
/** single-flight:并发触发(连接事件 + 调用方主动 ping)只发一次探测 */
let inflight: Promise<void> | null = null;

export function getPlatformState(): PlatformState | null {
  return state;
}

export function clearPlatformState(reason: string): void {
  if (state == null) return;
  state = null;
  debug(`平台状态已清空(${reason})`);
}

interface PingPayload {
  pong?: boolean;
  platform?: PluginPlatform;
  capabilities?: HostCapability[];
  coreCapabilities?: CoreCapability[];
  platformOps?: PlatformOpInfo[];
}

/**
 * 探测一次并写入缓存。fire-and-forget 语义:失败只落 debug 日志、不改状态,
 * 因此不会被"插件刚连上还没就绪"这类瞬时失败污染成错误。
 */
export function refreshPlatformState(bridge: Bridge): Promise<void> {
  if (inflight != null) return inflight;
  inflight = (async () => {
    try {
      const data = (await bridge.request(
        'ping',
        {},
        {
          timeout: PING_TIMEOUT_MS,
        },
      )) as PingPayload;
      if (data?.platform == null) {
        debug('平台探测:回包缺 platform,保持未探测状态(判定 fail-open)');
        return;
      }
      state = {
        platform: data.platform,
        capabilities: data.capabilities ?? [],
        coreCapabilities: data.coreCapabilities ?? [],
        platformOps: data.platformOps ?? [],
        at: Date.now(),
      };
      log(
        `平台状态已缓存: ${PLATFORM_LABEL[state.platform]}(平台差异能力 ${state.capabilities.length} 项 / 特有操作 ${state.platformOps.length} 个)`,
      );
    } catch (e) {
      debug(
        `平台探测失败(保持未探测状态,判定 fail-open): ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * 该工具在当前平台是否适用。
 * - `true`:声明的适用平台包含当前平台,或未声明平台归属
 * - `false`:平台已探测且不在适用列表内 → 调用方应直接拒绝,别发插件往返
 * - `null`:平台未知(未探测 / 已断开)→ fail-open,放行由插件侧报错
 */
export function isToolApplicable(def: PlatformScopedDef): boolean | null {
  if (def.platforms == null) return true;
  const current = state?.platform;
  if (current == null) return null;
  return def.platforms.includes(current);
}

/**
 * 平台不适用时的错误说明(适用或平台未知返回 null)。
 * 文案必须给全三件事:当前平台 / 该工具适用平台 / 可执行替代路径(platformNote)。
 */
export function describePlatformGate(def: PlatformScopedDef): string | null {
  if (isToolApplicable(def) !== false) return null;
  const current = state?.platform;
  if (current == null || def.platforms == null) return null;
  const applicable = def.platforms.map((p) => PLATFORM_LABEL[p]).join(' / ');
  return [
    `工具 ${def.name} 仅适用于 ${applicable},当前插件平台是 ${PLATFORM_LABEL[current]},已拒绝执行(未向插件发起请求)。`,
    def.platformNote != null ? `${def.platformNote}` : '',
    '平台能力与可用特有操作可读 jsd://platform/state 或调 jsd_ping 复核。',
  ].join('');
}
