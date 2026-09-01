import type {
  DesignHost,
  GetSelectionParams,
  GetSelectionResult,
  PlatformMeta,
  PluginPlatform,
  PluginRequest,
  SerializedNode,
} from 'text-to-design-shared';
import {
  applyCachedOverrides,
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
  removeNodes,
  repairNodes,
  reparentNodes,
  setInstanceProperties,
  setSelection,
  swapComponents,
  syncInstanceOverrides,
  trySerialize,
  updateSelection,
} from 'text-to-design-shared';

const UI_OPTIONS = { width: 360, height: 520 };

/** 平台无关插件外壳:注入平台 host,接插件生命周期与消息路由 */
export function registerPlugin(
  host: DesignHost,
  platform: PluginPlatform,
  meta: PlatformMeta,
): void {
  try {
    if (typeof __html__ === 'string' && __html__.trim() !== '') {
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
            capabilities: meta.capabilities,
          });
          break;
        case 'get_selection':
          send(id, true, getSelection(msg.params));
          break;
        case 'execute': {
          const r = await executeOps(
            host,
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
        case 'update_node': {
          const r = await updateSelection(host, msg.params);
          send(id, true, r);
          break;
        }
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
                groupNodes(host, { ids: p.ids ?? [], name: p.name }),
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
                combineAsVariantsNodes(host, {
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
                await applyCachedOverrides(host, {
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
                await syncInstanceOverrides(host, {
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
      fail(id, msg.method, e);
    }
  };
}
