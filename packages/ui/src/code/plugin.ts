import type {
  DesignHost,
  GetSelectionParams,
  GetSelectionResult,
  PlatformMeta,
  PluginError,
  PluginPlatform,
  PluginRequest,
  PropMethod,
  SerializedNode,
} from 'text-to-design-shared';
import {
  applyCachedOverrides,
  CAMERA_LOCK_DEFAULT,
  CORE_CAPABILITIES,
  clampPanelHeight,
  cloneNodes,
  combineAsVariantsNodes,
  copyInstanceOverrides,
  createComponentNodes,
  createInstances,
  createStyle,
  createSvgNode,
  deleteStyles,
  detachInstanceNodes,
  executeOps,
  exportNodes,
  fillImageNode,
  findNodes,
  flattenNodes,
  getPageStructure,
  groupNodes,
  importComponentNodes,
  isCameraLockSetMessage,
  isLocaleSetMessage,
  isUiMinimizeMessage,
  isUiResizeMessage,
  LOCALE_CHOICE_STORAGE_KEY,
  type LocaleChoice,
  listFonts,
  listStyles,
  makeResponse,
  normalizeChromeHeight,
  outlineStrokeNodes,
  PANEL_HEIGHT_DEFAULT,
  PANEL_MINIMIZED_SIZE,
  PANEL_TITLE,
  PANEL_WIDTH,
  PROP_METHOD_FIELDS,
  removeNodes,
  repairNodes,
  reparentNodes,
  runtimeContext,
  SYSTEM_CHOICE,
  setInstanceProperties,
  setSelection,
  swapComponents,
  syncInstanceOverrides,
  toStoredChoice,
  trySerialize,
  updateSelection,
  withCameraLock,
} from 'text-to-design-shared';

const UI_OPTIONS = {
  width: PANEL_WIDTH,
  height: PANEL_HEIGHT_DEFAULT,
  title: PANEL_TITLE,
};

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
  rawHost: DesignHost,
  platform: PluginPlatform,
  meta: PlatformMeta,
): void {
  // 相机锁:面板用户切换(camera_lock_set 旁路消息),默认锁定 —— MCP 操作
  // 画布时不移动相机。拦截收口在 host.viewport 契约层(见 shared/camera-lock.ts),
  // core 的各 scrollAndZoomIntoView 调用点不感知锁的存在。
  let cameraLocked = CAMERA_LOCK_DEFAULT;
  // 面板最小化态:旁路消息,见 shared/panel.ts
  let minimized = false;
  const host = withCameraLock(rawHost, () => cameraLocked);

  // 一次运行的显式上下文:core 的「字段是否生效」判定与 ping 上报的能力表同源,
  // 由这里组装成对象沿着调用链传下去(此前是模块级可变全局 setHostCapabilities,
  // 谁都能改、改完无从追查,也无法同时存在两个平台的实例)。
  // `platform` 一并注入:值域/适用性的**分平台收窄**要按平台 id 反查声明表
  // (`dicts/platform-value-domain.ts`),能力位表达不了(见 0022)。
  const ctx = runtimeContext(meta.capabilities, platform);

  // __html__ 由构建期注入,缺失给空串;判定只此一处,启动与最小化往返必须拿到同一份 html
  function panelHtml(): string {
    return typeof __html__ === 'string' ? __html__ : '';
  }

  /**
   * 面板外框尺寸只有这一处来源:showUI 与 resize 必须同值,否则宿主窗口与 iframe
   * 视口会各说各话。标题只能靠 showUI(UIAPI 没有 title 口),尺寸两条都发 ——
   * 谁被宿主认下都不落空。
   */
  function applyPanelFrame(): void {
    const width = minimized ? PANEL_MINIMIZED_SIZE : PANEL_WIDTH;
    // 装饰高单独 try:适配器读宿主 getter 有抛的可能,抛出去会越过 async onmessage 且无日志
    let chrome = 0;
    if (minimized) {
      try {
        chrome = normalizeChromeHeight(host.ui.chromeHeight?.());
      } catch (e) {
        console.error('[plugin] 读取装饰高失败(按 0 处理)', e);
      }
    }
    const height = minimized
      ? PANEL_MINIMIZED_SIZE + chrome
      : PANEL_HEIGHT_DEFAULT;
    try {
      host.showUI(panelHtml(), {
        width,
        height,
        title: minimized ? '' : PANEL_TITLE,
      });
    } catch (e) {
      console.error('[plugin] 面板标题切换失败', e);
    }
    try {
      host.ui.resize?.(width, height);
    } catch (e) {
      console.error('[plugin] 面板改尺寸失败', e);
    }
    // showUI 若重载了 iframe,新 UI 得重收一遍启动帧(幂等,见 scheduleBootPushes)
    scheduleBootPushes();
  }

  try {
    const html = panelHtml();
    if (!html) console.warn('[plugin] __html__ 未注入,UI 面板为空');
    host.showUI(html, UI_OPTIONS);
  } catch (e) {
    console.error('[plugin] showUI 失败', e);
  }
  // 启动帧(见 scheduleBootPushes)
  scheduleBootPushes();

  function send(
    id: string,
    ok: boolean,
    data?: unknown,
    error?: PluginError,
  ): void {
    try {
      host.ui.postMessage(makeResponse(id, ok, data, error));
    } catch (e) {
      console.error('[plugin] 发送响应失败', id, e);
    }
  }

  function fail(id: string, e: unknown): void {
    const reason = e instanceof Error ? e.message : String(e);
    send(id, false, undefined, { code: 'engine_error', message: reason });
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

  function pushPlatform(): void {
    try {
      host.ui.postMessage({ type: 'platform', platform });
    } catch (e) {
      console.error('[plugin] 推送平台失败', e);
    }
  }

  /**
   * 上报宿主有没有 `ui.resize`、以及窗口外框里的装饰高(0028),UI 据此决定
   * 「窗口贴内容」还是「选中节点吃满剩余高度」,并算出真实请求高度。
   *
   * 为什么必须由 code 侧告知:resize 返回 void,宿主就算把请求当空气也不会报错,
   * UI 侧没有任何可观测的判据。能判的只有「符号在不在」,而那只有这里看得到。
   *
   * 装饰高在这里**求值一次就下发**,不在 UI 侧每次测量时再问:它是宿主窗口的属性、
   * 与内容无关,逐次回问只会给测量环加一次跨进程往返,而没有任何刷新时机上的收益。
   */
  function pushUiEnv(): void {
    try {
      const ui = host.ui as { resize?: unknown } | undefined;
      host.ui.postMessage({
        type: 'ui_env',
        canResize: typeof ui?.resize === 'function',
        // 装饰高只有 MG 有真源,另两平台的适配器不实现本方法 → 下发 0(不补偿)。
        // 收口走 normalizeChromeHeight:适配器给什么都不该让荒唐值冲进请求
        chromeHeight: normalizeChromeHeight(host.ui.chromeHeight?.()),
      });
    } catch (e) {
      console.error('[plugin] 推送面板环境失败', e);
    }
  }

  /**
   * 宿主存储:语言选择的保管员(0016)。两边都是**可选**能力 ——
   * jsDesign 的 `clientStorage` 在 typings 里存在(runtime 是否实现未实测),
   * 所以判据是 `typeof`、调用点 `try/catch`,拿不到就当没有,绝不让面板起不来。
   */
  const storage = host.clientStorage;
  const canStore = typeof storage?.getAsync === 'function';

  async function readStoredChoice(): Promise<unknown> {
    if (!canStore) return null;
    try {
      return await storage.getAsync(LOCALE_CHOICE_STORAGE_KEY);
    } catch (e) {
      console.warn('[plugin] 读取语言选择失败(按未选过处理)', e);
      return null;
    }
  }

  async function writeStoredChoice(choice: LocaleChoice): Promise<void> {
    if (!canStore) return;
    try {
      // 「跟随系统」= 清掉存储值:否则用户以后换了系统语言,
      // 插件还停在旧语言上(键是显式的,不该表达「随时间变化」的语义)
      if (choice === SYSTEM_CHOICE) {
        await storage.deleteAsync?.(LOCALE_CHOICE_STORAGE_KEY);
        return;
      }
      await storage.setAsync(LOCALE_CHOICE_STORAGE_KEY, choice);
    } catch (e) {
      console.warn('[plugin] 保存语言选择失败(本次会话内仍生效)', e);
    }
  }

  function pushLocaleState(): void {
    void readStoredChoice().then((stored) => {
      try {
        host.ui.postMessage({
          type: 'locale_state',
          stored: toStoredChoice(stored),
        });
      } catch (e) {
        console.error('[plugin] 推送语言选择失败', e);
      }
    });
  }

  /**
   * 启动帧(含选中):showUI 后 UI iframe 加载是异步的,立即推可能丢消息,故统一延后补发。
   *
   * 选中沿用原来的 300ms(状态三条 200ms):它要跑一次 getSelection 读节点数据,
   * 是四条里最重的,留的余量更大。
   *
   * 重复调用幂等,所以 applyPanelFrame() 之后可以无条件补推 —— 再次 showUI 会关掉旧 UI
   * 再显示新的(plugin-api.d.ts:365),每次最小化/恢复都重建 iframe(dec 28008c70):
   * ui_env 只是覆写 canResize / chromeHeight;platform 只是再触发一次 refreshCapabilities;
   * locale_state 在用户手动选过时被 applyStoredChoice 挡掉;selection 只是覆写选中卡片。
   */
  function scheduleBootPushes(): void {
    setTimeout(pushPlatform, 200);
    setTimeout(pushUiEnv, 200);
    setTimeout(pushLocaleState, 200);
    setTimeout(pushSelection, 300);
  }

  host.ui.onmessage = async (raw: unknown) => {
    // 面板最小化:旁路消息(见 shared/panel.ts),必须先于 ui_resize 拦掉(dec 28008c70)——
    // 它没有 method,落到下面的 switch 会回一个「未知 method」错误包,而 UI 侧并不等这个回包。
    if (isUiMinimizeMessage(raw)) {
      minimized = raw.minimized;
      applyPanelFrame();
      return;
    }
    // 面板自改高度:旁路消息,不在 PluginRequest 契约内(理由见 shared/panel.ts)。
    // 必须在取 msg.method 之前拦掉 —— 它没有 method,落到下面会回一个「未知 method」
    // 错误包,而 UI 侧根本没在等这个回包,等于凭空多一条错误日志。
    if (isUiResizeMessage(raw)) {
      // 最小化期间高度请求无意义(窗口是模式尺寸,不是内容尺寸),而 clampPanelHeight 的下限是
      // 「内容可用的最小高度」,放过去会把 50px 抬成 300 的细条(dec 28008c70)
      if (minimized) return;
      try {
        // 再夹一次:UI 已夹过,但契约的两端都该能独立站住(0013 的分层边界同样思路)。
        // 夹取上限是 `PANEL_HEIGHT_CEILING`(防荒唐值的硬边界),**不是**内容高度的
        // 截断点 —— 拿后者当上限会让超出部分被宿主裁掉且没有滚动条可救(0014 修订)
        host.ui.resize?.(PANEL_WIDTH, clampPanelHeight(raw.height));
      } catch (e) {
        console.error('[plugin] 面板改尺寸失败', e);
      }
      return;
    }
    // 语言选择:同款旁路消息(见 shared/locale-channel.ts)。持久化在这里做,
    // 因为 clientStorage 只有 code 侧摸得到
    if (isLocaleSetMessage(raw)) {
      await writeStoredChoice(raw.choice);
      return;
    }
    // 相机锁:同款旁路消息(见 shared/camera-lock.ts)。状态只存 here(进程内),
    // UI 侧持久化并在挂载时补发,code 侧无需跨会话记忆
    if (isCameraLockSetMessage(raw)) {
      cameraLocked = raw.locked;
      return;
    }
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
          const r = await createSvgNode(host, msg.params.svg, msg.params.name);
          send(id, true, r);
          break;
        }
        // 属性引擎方法走表驱动(见 isPropMethod),方法名即字段分组,
        // 越界字段由 updateSelection 按同一份 PROP_METHOD_FIELDS 拦截。
        // 以下 case 的 core 入口全部异步(dynamic-page 文档访问,见决策 0011):
        // 分发本身已在 async handler 内,await 不改变时序,只把解析点收口到 Access 层。
        case 'find': {
          const r = await findNodes(host, ctx, msg.params);
          send(id, true, r);
          break;
        }
        case 'node_op': {
          const p = msg.params;
          switch (p.op) {
            case 'select':
              send(id, true, await setSelection(host, p.ids ?? []));
              break;
            case 'remove':
              send(
                id,
                true,
                await removeNodes(host, { ids: p.ids, matchName: p.matchName }),
              );
              break;
            case 'clone':
              send(id, true, await cloneNodes(host, p.ids ?? []));
              break;
            case 'group':
              send(
                id,
                true,
                await groupNodes(host, {
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
                await groupNodes(host, { ids: p.ids ?? [], ungroup: true }),
              );
              break;
            case 'flatten':
              send(id, true, await flattenNodes(host, p.ids ?? []));
              break;
            case 'outline_stroke':
              send(id, true, await outlineStrokeNodes(host, p.ids ?? []));
              break;
            case 'reparent':
              send(
                id,
                true,
                await reparentNodes(host, {
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
              send(id, false, undefined, {
                code: 'unknown_method',
                message: `未知 node_op: ${String((p as { op?: string }).op)}`,
              });
              return;
          }
          break;
        }
        case 'component_op': {
          const p = msg.params;
          switch (p.op) {
            case 'create_component': {
              // 协议层的 params 是各 op 字段的并集,此处按 op 收窄成本操作的入参形状
              const cp = p as Parameters<typeof createComponentNodes>[2];
              send(
                id,
                true,
                await createComponentNodes(host, ctx, {
                  ids: cp.ids ?? [],
                  name: cp.name,
                  children: cp.children ?? [],
                  width: cp.width,
                  height: cp.height,
                }),
              );
              break;
            }
            case 'create_instance':
              send(id, true, await createInstances(host, p.ids ?? []));
              break;
            case 'detach_instance':
              send(id, true, await detachInstanceNodes(host, ctx, p.ids ?? []));
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
                await swapComponents(host, {
                  ids: p.ids ?? [],
                  componentId: p.componentId ?? '',
                }),
              );
              break;
            case 'set_instance_properties':
              send(
                id,
                true,
                await setInstanceProperties(host, ctx, {
                  ids: p.ids ?? [],
                  properties: p.properties ?? {},
                }),
              );
              break;
            case 'combine_as_variants':
              send(
                id,
                true,
                await combineAsVariantsNodes(host, ctx, {
                  ids: p.ids ?? [],
                  name: p.name,
                }),
              );
              break;
            case 'copy_overrides':
              send(
                id,
                true,
                await copyInstanceOverrides(host, ctx, {
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
              send(id, false, undefined, {
                code: 'unknown_method',
                message: `未知 component_op: ${String((p as { op?: string }).op)}`,
              });
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
          // 过滤/分页参数原样透传(默认页在 core 里兜):字体库规模随平台差一个量级
          const r = await listFonts(host, msg.params);
          send(id, true, r);
          break;
        }
        case 'list_styles': {
          // 无筛选参数:dec 0042 的单类入口是为「哪一类挂死」取证的探针,dec 0043 把判据
          // 换成平台能力声明后已摘掉 —— 不该问的平台一个 getter 都不会调(真机上问了不回答的
          // 是永不 resolve 的 `*Async`,见 dec 0043 的 2026-10-15 更正)。
          const r = await listStyles(host, ctx);
          send(id, true, r);
          break;
        }
        case 'create_style': {
          const p = msg.params;
          const r = await createStyle(host, ctx, {
            kind: p.kind,
            name: p.name,
            ...(p.description == null ? {} : { description: p.description }),
            fromNodeId: p.fromNodeId,
          });
          send(id, true, r);
          break;
        }
        case 'delete_style': {
          const r = await deleteStyles(host, ctx, msg.params.ids);
          send(id, true, r);
          break;
        }
        case 'get_page': {
          send(id, true, await getPageStructure(host, ctx));
          break;
        }
        case 'platform_op': {
          const p = msg.params;
          const op = meta.platformOps.find((o) => o.name === p.op);
          if (!op) {
            send(id, false, undefined, {
              code: 'platform_unsupported',
              message: `平台 ${platform} 不支持操作: ${p.op}(支持: ${meta.platformOps.map((o) => o.name).join(',') || '无'})`,
            });
            break;
          }
          let params: unknown = p.params ?? {};
          if (op.inputSchema) {
            const parsed = op.inputSchema.safeParse(params);
            if (!parsed.success) {
              const detail = parsed.error.issues
                .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
                .join('; ');
              send(id, false, undefined, {
                code: 'invalid_args',
                message: `参数校验失败(${op.name}): ${detail}`,
              });
              break;
            }
            params = parsed.data;
          }
          // 回包**就是 op 自己的返回**,不再套 `{ok,data}`:协议信封已经带过一次 ok/data,
          // 这层重复信封会渗进模型的占位符词汇(批内得写 `{{步骤.data.variables[0].id}}`,
          // 而 batch 文档给所有工具写的是 `{{步骤.字段}}`),实测第一次调用就中止整批。
          send(id, true, await op.run(host, params));
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
          send(id, false, undefined, {
            code: 'unknown_method',
            message: `未知方法: ${(msg as { method: string }).method}`,
          });
      }
    } catch (e) {
      // 可观测性:引擎/运行时错误带堆栈与请求摘要落插件 console,
      // 便于定位 "not a function" / "in set_fills" 这类难懂错误
      const paramsSummary = JSON.stringify(msg.params ?? {}).slice(0, 500);
      console.error(`[plugin] ${msg.method} 失败, params=${paramsSummary}`, e);
      fail(id, e);
    }
  };
}
