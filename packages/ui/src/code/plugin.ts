import type {
  DesignHost,
  GetSelectionParams,
  GetSelectionResult,
  PlatformMeta,
  PluginPlatform,
  PluginRequest,
  PropMethod,
  SerializedNode,
} from 'text-to-design-shared';
import {
  applyCachedOverrides,
  CORE_CAPABILITIES,
  cloneNodes,
  combineAsVariantsNodes,
  copyInstanceOverrides,
  createComponentNodes,
  createInstances,
  createSvgNode,
  detachInstanceNodes,
  executeOps,
  exportNodes,
  fillImageNode,
  findNodes,
  flattenNodes,
  getPageStructure,
  groupNodes,
  importComponentNodes,
  listFonts,
  listStyles,
  makeResponse,
  outlineStrokeNodes,
  PROP_METHOD_FIELDS,
  removeNodes,
  repairNodes,
  reparentNodes,
  runtimeContext,
  setInstanceProperties,
  setSelection,
  swapComponents,
  syncInstanceOverrides,
  trySerialize,
  updateSelection,
} from 'text-to-design-shared';

const UI_OPTIONS = { width: 360, height: 520 };

/**
 * 属性引擎方法判定:方法名是否存在于字段表。
 *
 * 早先这里把 11 个 prop-method 逐个写成 switch case,那是同一份名单的第 4 份手抄
 * (另外三份在 schemas/split-ops 的 PropMethod、index 的 PropParamsByMethod 与
 * PluginRequest)。新增属性方法要记得改四处,漏这里的症状是「工具注册成功、
 * 校验通过、插件回未知方法」。判定改走 shared 的字段表后,加方法只需改那份表。
 * 一致性由 tests/plugin-prop-dispatch.test.ts 守住:这里再出现 case 就测试失败。
 */
function isPropMethod(method: PluginRequest['method']): boolean {
  // 不能用 Object.hasOwn(ES2022):插件产物 target=es6 只降语法、不注入 API polyfill,
  // 而设计宿主沙箱的运行时没有它 —— 报错是「not a function」,且因为这里是所有属性类
  // 请求的必经判定口,症状是**全部** jsd_set_*/move/resize 集体失败(创建类工具正常)。
  //
  return Object.prototype.hasOwnProperty.call(PROP_METHOD_FIELDS, method);
}

/** 属性类请求的收窄视图:多例(run)时 isPropMethod 已确认方法名在字段表内 */
type PropRequest = Extract<PluginRequest, { method: PropMethod }>;

/** 平台无关插件外壳:注入平台 host,接插件生命周期与消息路由 */
export function registerPlugin(
  host: DesignHost,
  platform: PluginPlatform,
  meta: PlatformMeta,
): void {
  // 一次运行的显式上下文:core 的「字段是否生效」判定与 ping 上报的能力表同源,
  // 由这里组装成对象沿着调用链传下去(此前是模块级可变全局 setHostCapabilities,
  // 谁都能改、改完无从追查,也无法同时存在两个平台的实例)
  const ctx = runtimeContext(meta.capabilities);
  try {
    if (__html__ || (typeof __html__ === 'string' && __html__.trim() !== '')) {
      host.showUI(__html__, UI_OPTIONS);
    } else {
      console.warn('[plugin] __html__ 未注入,UI 面板为空');
      host.showUI('', UI_OPTIONS);
    }
  } catch (e) {
    console.error('[plugin] showUI 失败', e);
  }

  function send(id: string, ok: boolean, data?: unknown, error?: string): void {
    try {
      host.ui.postMessage(makeResponse(id, ok, data, error));
    } catch (e) {
      console.error('[plugin] 发送响应失败', id, e);
    }
  }

  function fail(id: string, method: string, e: unknown): void {
    const reason = e instanceof Error ? e.message : String(e);
    send(id, false, undefined, `${method} 失败: ${reason}`);
  }

  function getSelection(params: GetSelectionParams = {}): GetSelectionResult {
    const selection = host.currentPage.selection;
    const depth = params.depth ?? 2;
    return {
      selection: selection.map((n) => {
        const s = trySerialize(n, depth);
        if (s) return s;
        // 单个节点读取失败(如含 dangling 子节点)时代为最小壳,不整体扑灭 selection
        const fallback: SerializedNode = {
          id: n.id,
          name: n.name,
          type: n.type,
          x: Math.round(n.x) || 0,
          y: Math.round(n.y) || 0,
        };
        return fallback;
      }),
      pageName: host.currentPage.name,
    };
  }

  function pushSelection(): void {
    try {
      host.ui.postMessage({
        type: 'selection',
        data: getSelection({ depth: 1 }),
      });
    } catch (e) {
      console.error('[plugin] 推送选中失败', e);
    }
  }

  host.on('selectionchange', pushSelection);
  setTimeout(pushSelection, 300);

  function pushPlatform(): void {
    try {
      host.ui.postMessage({ type: 'platform', platform });
    } catch (e) {
      console.error('[plugin] 推送平台失败', e);
    }
  }
  // 补发一次:showUI 后 UI iframe 加载是异步的,立即推可能丢消息
  setTimeout(pushPlatform, 200);

  host.ui.onmessage = async (raw: unknown) => {
    const msg = raw as PluginRequest;
    const id = msg.id;
    try {
      switch (msg.method) {
        case 'ping':
          send(id, true, {
            pong: true,
            platform,
            // capabilities 只列平台差异项(jsDesign 仅 styles);
            // 核心能力两平台一致,直接回传共享常量,避免调用方从 capabilities 里误判
            capabilities: meta.capabilities,
            coreCapabilities: CORE_CAPABILITIES,
            // op 名单随 ping 下发:调用方不必猜 op 名(schema 本体不进线格式,参数形状在 description 里)
            platformOps: meta.platformOps.map(
              ({ name, title, description }) => ({
                name,
                title,
                description,
              }),
            ),
          });
          break;
        case 'get_selection':
          send(id, true, getSelection(msg.params));
          break;
        case 'execute': {
          const r = await executeOps(
            host,
            ctx,
            msg.params.ops,
            msg.params.placement,
          );
          send(id, true, r);
          break;
        }
        case 'create_svg': {
          const r = createSvgNode(host, msg.params.svg, msg.params.name);
          send(id, true, r);
          break;
        }
        // 属性引擎方法走表驱动(见 isPropMethod),方法名即字段分组,
        // 越界字段由 updateSelection 按同一份 PROP_METHOD_FIELDS 拦截。
        case 'find': {
          const r = findNodes(host, msg.params);
          send(id, true, r);
          break;
        }
        case 'node_op': {
          const p = msg.params;
          switch (p.op) {
            case 'select':
              send(id, true, setSelection(host, p.ids ?? []));
              break;
            case 'remove':
              send(
                id,
                true,
                removeNodes(host, { ids: p.ids, matchName: p.matchName }),
              );
              break;
            case 'clone':
              send(id, true, cloneNodes(host, p.ids ?? []));
              break;
            case 'group':
              send(
                id,
                true,
                groupNodes(host, {
                  ids: p.ids ?? [],
                  name: p.name,
                  // 布局参数必须原样透传:此前只传 ids/name,导致 layoutMode
                  // 及间距/对齐/padding 在插件侧全被丢弃,永远走纯归组分支
                  layoutMode: p.layoutMode,
                  itemSpacing: p.itemSpacing,
                  paddingTop: p.paddingTop,
                  paddingRight: p.paddingRight,
                  paddingBottom: p.paddingBottom,
                  paddingLeft: p.paddingLeft,
                  primaryAxisSizingMode: p.primaryAxisSizingMode,
                  counterAxisSizingMode: p.counterAxisSizingMode,
                  primaryAxisAlignItems: p.primaryAxisAlignItems,
                  counterAxisAlignItems: p.counterAxisAlignItems,
                }),
              );
              break;
            case 'ungroup':
              send(
                id,
                true,
                groupNodes(host, { ids: p.ids ?? [], ungroup: true }),
              );
              break;
            case 'flatten':
              send(id, true, flattenNodes(host, p.ids ?? []));
              break;
            case 'outline_stroke':
              send(id, true, outlineStrokeNodes(host, p.ids ?? []));
              break;
            case 'reparent':
              send(
                id,
                true,
                reparentNodes(host, {
                  ids: p.ids ?? [],
                  parentId: p.parentId,
                  index: p.index,
                }),
              );
              break;
            case 'repair':
              send(id, true, repairNodes(host));
              break;
            default:
              send(
                id,
                false,
                undefined,
                `未知 node_op: ${String((p as { op?: string }).op)}`,
              );
              return;
          }
          break;
        }
        case 'component_op': {
          const p = msg.params;
          switch (p.op) {
            case 'create_component':
              send(
                id,
                true,
                createComponentNodes(host, { ids: p.ids ?? [], name: p.name }),
              );
              break;
            case 'create_instance':
              send(id, true, createInstances(host, p.ids ?? []));
              break;
            case 'detach_instance':
              send(id, true, detachInstanceNodes(host, p.ids ?? []));
              break;
            case 'import_component':
              send(
                id,
                true,
                await importComponentNodes(host, {
                  key: p.key ?? '',
                  name: p.name,
                }),
              );
              break;
            case 'swap_component':
              send(
                id,
                true,
                swapComponents(host, {
                  ids: p.ids ?? [],
                  componentId: p.componentId ?? '',
                }),
              );
              break;
            case 'set_instance_properties':
              send(
                id,
                true,
                setInstanceProperties(host, {
                  ids: p.ids ?? [],
                  properties: p.properties ?? {},
                }),
              );
              break;
            case 'combine_as_variants':
              send(
                id,
                true,
                combineAsVariantsNodes(host, ctx, {
                  ids: p.ids ?? [],
                  name: p.name,
                }),
              );
              break;
            case 'copy_overrides':
              send(
                id,
                true,
                copyInstanceOverrides(host, {
                  sourceId: p.sourceId ?? '',
                }),
              );
              break;
            case 'apply_overrides':
              send(
                id,
                true,
                await applyCachedOverrides(host, ctx, {
                  sourceId: p.sourceId ?? '',
                  ids: p.ids ?? [],
                  swapToSource: p.swapToSource ?? false,
                }),
              );
              break;
            case 'sync_overrides':
              send(
                id,
                true,
                await syncInstanceOverrides(host, ctx, {
                  sourceId: p.sourceId ?? '',
                  ids: p.ids ?? [],
                  swapToSource: p.swapToSource ?? false,
                }),
              );
              break;
            default:
              send(
                id,
                false,
                undefined,
                `未知 component_op: ${String((p as { op?: string }).op)}`,
              );
              return;
          }
          break;
        }
        case 'export': {
          const r = await exportNodes(host, msg.params);
          send(id, true, r);
          break;
        }
        case 'fill_image': {
          const bytes = msg.params.bytes ?? new Uint8Array(0);
          const r = await fillImageNode(host, { ids: msg.params.ids, bytes });
          send(id, true, r);
          break;
        }
        case 'list_fonts': {
          const r = await listFonts(host);
          send(id, true, r);
          break;
        }
        case 'list_styles': {
          send(id, true, listStyles(host));
          break;
        }
        case 'get_page': {
          send(id, true, getPageStructure(host));
          break;
        }
        case 'platform_op': {
          const p = msg.params;
          const op = meta.platformOps.find((o) => o.name === p.op);
          if (!op) {
            send(
              id,
              false,
              undefined,
              `平台 ${platform} 不支持操作: ${p.op}(支持: ${meta.platformOps.map((o) => o.name).join(',') || '无'})`,
            );
            break;
          }
          let params: unknown = p.params ?? {};
          if (op.inputSchema) {
            const parsed = op.inputSchema.safeParse(params);
            if (!parsed.success) {
              const detail = parsed.error.issues
                .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
                .join('; ');
              send(id, false, undefined, `参数校验失败(${op.name}): ${detail}`);
              break;
            }
            params = parsed.data;
          }
          const r = await op.run(host, params);
          send(id, true, { ok: true, data: r });
          break;
        }
        default:
          // 属性引擎方法(见 isPropMethod):走到这里说明它不在上面任何一个显式
          // case 里 —— 合格则按孤儿中断处理,不合格才是未知方法。
          if (isPropMethod(msg.method)) {
            const req = msg as PropRequest;
            send(
              id,
              true,
              await updateSelection(host, ctx, req.params, req.method),
            );
            break;
          }
          send(
            id,
            false,
            undefined,
            `未知方法: ${(msg as { method: string }).method}`,
          );
      }
    } catch (e) {
      // 可观测性:引擎/运行时错误带堆栈与请求摘要落插件 console,
      // 便于定位 "not a function" / "in set_fills" 这类难懂错误
      const paramsSummary = JSON.stringify(msg.params ?? {}).slice(0, 500);
      console.error(`[plugin] ${msg.method} 失败, params=${paramsSummary}`, e);
      const opName =
        msg.method === 'node_op' || msg.method === 'component_op'
          ? ` ${String((msg.params as { op?: string } | undefined)?.op ?? '')}`
          : '';
      fail(id, `${msg.method}${opName}`, e);
    }
  };
}
