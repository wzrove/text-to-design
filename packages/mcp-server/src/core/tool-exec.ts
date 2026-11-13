import type { McpServer } from '@modelcontextprotocol/server';
import type {
  ActivityPhase,
  MessageKey,
  PluginMethod,
} from 'text-to-design-shared';
import type { Bridge } from '../bridge';
import type { McpI18n } from '../i18n';
import { error, warn } from '../logger';
import type { RequestOptions } from '../pending';
import { describePlatformGate } from '../platform-state';
import { BridgeError, errorCodeOf } from './bridge-error';
import { localizeSchema } from './localize-schema';
import { err, type FollowUp, structured } from './response';
import { describeInvalidArgs } from './schema-error';
import { isPublicTool, registerCapability, toolCatalog } from './tool-catalog';
import type { BridgeToolDef, ToolExecutor, ToolHandle } from './tool-def';
import { iconForTool } from './tool-icons';

export function lookupExecutor(
  name: string,
  server: McpServer,
): ToolExecutor | undefined {
  return toolCatalog(server).executors.get(name);
}

export function executorNames(server: McpServer): string[] {
  return [...toolCatalog(server).executors.keys()].sort();
}

/**
 * 声明式工具工厂:统一 try/catch → structured/err 兜底、超时分级、
 * annotations、客户端取消(signal)传播。返回注册函数,产出工具句柄
 * (供插件离线时动态 disable)。
 */
export function bridgeTool(
  def: BridgeToolDef,
): (server: McpServer, bridge: Bridge, i18n: McpI18n) => ToolHandle {
  return (server: McpServer, bridge: Bridge, i18n: McpI18n): ToolHandle => {
    /**
     * followUp.description 与 title / description 走同一条 0016 约定:源码里存
     * MessageKey。注册期只投影了 title / description,**结果里的 followUp 曾整块
     * 原样透传**,调用方读到的是 `"find.description"` 这种裸键。投影点收在这里,
     * 覆盖 structured / err / 平台门控三条出口。
     * `type:'prompt'` 的 followUp 存的是成品文案(如「插件未连接」引导),不译。
     */
    const projectFollowUp = (
      fu: FollowUp | undefined,
    ): FollowUp | undefined => {
      if (fu == null || fu.type !== 'tool') return fu;
      if (!isPublicTool(server, fu.tool)) {
        return {
          type: 'tool',
          tool: 'jsd_describe_tools',
          description: fu.tool,
        };
      }
      return fu.description == null
        ? fu
        : { ...fu, description: i18n.t(fu.description as MessageKey) };
    };
    /**
     * 面板侧的活动提醒(最小化态的宠物)是**旁路**:它连的是给人看的动画,
     * 推送失败(甚至对端根本没这个方法)不许把工具调用带塌 —— 与 hook 同一条纪律。
     * 失败只留一行 warning,不静默(0007)。
     */
    const notifyActivity = (phase: ActivityPhase, tool: string): void => {
      try {
        bridge.notifyActivity(phase, tool);
      } catch (e) {
        warn(
          `活动提醒推送失败(已忽略): ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    };

    // 可编程执行体:MCP 回调与 jsd_batch 编排共用(统一兜底/超时/取消传播)
    const executeTool: ToolExecutor = async (args, signal, opts) => {
      try {
        // 平台门控:平台状态已缓存且本工具不适用时,直接给结构化错误(含替代路径),
        // 不向插件发起往返 —— 插件侧同样会拒绝,但报错更晚也更含糊。平台未知放行。
        const gate = describePlatformGate(def);
        if (gate != null) {
          error(`工具 ${def.name} 在当前平台不可用,已拦截`, {
            scope: 'tool',
            subject: def.name,
            code: 'platform_unsupported',
          });
          return err(
            new BridgeError('platform_unsupported', gate),
            def.outputSchema,
            projectFollowUp(def.followUp),
          );
        }
        // 入参 schema 校验:直接 MCP 调用已由 SDK validateToolInput 校验过(幂等,
        // 成本可忽略),这里补齐 jsd_batch 直调 executor 的路径——内层工具的
        // inputSchema 不生效,坏载荷(颜色带 a / 0-255 / 渐变带 color / 缺
        // blendMode 等)会原样穿透到引擎抛 in set_fills/set_effects。
        // 这条路径**唯一**的出口就是下面的报错,故越界字段在此点名(0034):
        // SDK 那层被绕过,再不给可删的动作,调用方只能猜。
        if (def.inputSchema != null) {
          const parsed = def.inputSchema.safeParse(args);
          if (!parsed.success) {
            const detail = parsed.error.issues
              .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
              .join('; ');
            throw new BridgeError(
              'invalid_args',
              `参数校验失败(${def.name}): ${describeInvalidArgs(def.inputSchema, args, detail)}`,
            );
          }
          args = parsed.data as Record<string, unknown>;
        }
        const requestOpts: RequestOptions = {
          ...(signal != null ? { signal } : {}),
          ...(def.timeout != null ? { timeout: def.timeout } : {}),
        };
        // 横切钩子:每次调用新建一份(钩子内部要按本次调用记账)。
        // 钩子只做尽力而为的复核,抛错一律降级为 warning,不能让工具失败。
        // checkDrift=false 之类的「本次不复核」是**按调用**生效的:钩子工厂本身
        // 仍在 def 上,只是这一次不实例化 —— 不是把开关塞进全局。
        // 面板侧的活动提醒(最小化态的宠物):此处是**所有**工具执行体的唯一收口
        // (MCP 回调与 jsd_batch 内层都走 executeTool),故只需要在这里埋一次
        notifyActivity('running', def.name);
        const hook = opts?.skipHooks === true ? undefined : def.hook?.(server);
        if (hook?.before != null) {
          try {
            await hook.before(args);
          } catch (e) {
            warn(
              `工具 ${def.name} 的前置钩子失败(已忽略): ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }
        let data: unknown;
        if (def.run) {
          data = await def.run(
            args,
            bridge,
            signal ?? new AbortController().signal,
          );
        } else {
          data = await bridge.request(
            def.method as PluginMethod,
            def.payload ? def.payload(args) : args,
            requestOpts,
          );
        }
        const extra = def.extraContent
          ? def.extraContent(data, args, opts)
          : [];
        // 钩子产出的告警同时走两条通道:① 人读文本块(单工具调用时直接可见);
        // ② 结果上的 warnings 字段 —— jsd_batch 逐步骤收集后汇总,否则编排里
        // 只看 structuredContent,这些告警会被静默丢掉。
        const warnings: string[] = [];
        // 插件/core 自己在结果里带的 warnings(创建路径的字段未生效、reparent 的
        // 布局属性被父级重写等)也要进这条通道:jsd_batch 只汇总 tools 结果顶层的
        // warnings,埋在 data 里的话编排批次里会被静默丢掉(2026-10-20 补)。
        const dataWarnings = (data as { warnings?: unknown } | null)?.warnings;
        if (Array.isArray(dataWarnings)) {
          for (const line of dataWarnings) {
            if (typeof line === 'string' && line !== '') warnings.push(line);
          }
        }
        if (hook?.after != null) {
          try {
            const lines = (await hook.after(args, data)) ?? [];
            for (const line of lines) {
              warnings.push(line);
              extra.push({ type: 'text', text: line });
            }
          } catch (e) {
            const line = `⚠ 工具 ${def.name} 的后置钩子失败(不影响本次结果): ${e instanceof Error ? e.message : String(e)}`;
            warnings.push(line);
            extra.push({ type: 'text', text: line });
          }
        }
        const result = structured(
          data,
          def.outputSchema,
          extra.length > 0 ? extra : undefined,
          projectFollowUp(def.followUp),
        );
        notifyActivity('success', def.name);
        return warnings.length > 0 ? { ...result, warnings } : result;
      } catch (e) {
        // 可观测性:插件执行期错误(如引擎校验失败)落日志,便于排查。
        // 注意:入参 schema 校验失败发生在 SDK 内部(validateToolInput),
        // 不经过本回调,无法在此记录 —— 该类错误只体现在返回给客户端的
        // isError 文本中
        const msg = e instanceof Error ? e.message : String(e);
        error(`工具 ${def.name} 执行失败: ${msg.slice(0, 200)}`, {
          scope: 'tool',
          subject: def.name,
          code: errorCodeOf(e),
        });
        notifyActivity('error', def.name);
        return err(e, def.outputSchema, projectFollowUp(def.followUp));
      }
    };
    const { t } = i18n;
    const handle = registerCapability(
      server,
      {
        name: def.name,
        title: t(def.title as MessageKey),
        // description 整段原样下发(键或成品文案),后缀按同一口径拼在末尾 ——
        // 逐段 t() 查表,拼出来的串查不到表也不影响(见 tool-def 的类型注释)
        description:
          def.descriptionSuffix == null
            ? t(def.description as MessageKey)
            : t(def.description as MessageKey) +
              t(def.descriptionSuffix as MessageKey),
        ...(def.inputSchema == null
          ? {}
          : { inputSchema: localizeSchema(def.inputSchema, t) }),
        outputSchema: localizeSchema(def.outputSchema, t),
        annotations: def.annotations,
        icons: def.icons ?? iconForTool(def.name),
      },
      executeTool,
    );
    return handle;
  };
}
