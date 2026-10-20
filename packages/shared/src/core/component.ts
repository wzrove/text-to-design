import { PLATFORM_LABEL } from '../dicts/platform';
import { platformMethodParamAllowed } from '../dicts/platform-value-domain';
import type {
  ComponentPropertyAliasValue,
  ComponentPropertyValue,
  ExecuteOp,
  SerializedNode,
  UpdateNodeProps,
  VariableAliasRef,
} from '../schemas';
import { resolveMainComponent, resolveNodes, resolveNodesMap } from './access';
import buildNode from './buildNode';
import { hostCapabilityState } from './capabilities';
import {
  type ContainerSkeleton,
  type DesignHost,
  MIXED,
  type NodeSkeleton,
} from './host';
import type { RuntimeContext } from './runtime';
import { serializeNode } from './serialize';
import { updateSelection } from './update';
import { resizeContainer } from './utils';
import {
  normalizeVariantGroupProperties,
  resolveVariantWriteKey,
  variantValueOffered,
} from './variant';

export async function createComponentNodes(
  host: DesignHost,
  ctx: RuntimeContext,
  params: {
    ids?: string[];
    name?: string;
    children?: ExecuteOp[];
    width?: number;
    height?: number;
  },
): Promise<{ created: SerializedNode }> {
  // ids 只做「存在性校验」,不改动这些节点:组件一律新建,不把已有节点卷进来 ——
  // appendChild 已有节点会触发引擎再包一层 wrapper,后续删 wrapper 连坐删子树并残留 dangling。
  if (params.ids != null && params.ids.length > 0) {
    const nodes = await resolveNodes(host, params.ids);
    if (nodes.length === 0) {
      throw new Error('没有找到要固化为组件的节点');
    }
  }
  const component = host.createComponent();
  component.name = params.name ?? 'component';
  // 子节点走通用 buildNode 管线(写入 / 布局 / 回读回收与 create 路径同源),三平台行为一致 ——
  // 不用 mg.createComponent(children) 那条平台专属分支,否则「带内容建组件」会变成 MG 独有能力(0020)。
  const parent = component as ContainerSkeleton;
  for (const child of params.children ?? []) {
    await buildNode(host, ctx, child, parent);
  }
  // 尺寸最后压:插子节点时引擎会按内容重算容器尺寸,写在前面会被吃掉。
  // ⚠ 必须用 `resizeContainer`(不施加约束的重载):组件壳在所有平台都是 100×100 起,
  // jsDesign 组件的子节点默认约束是 `SCALE`,直接 `resize()` 会把子节点按
  // (w/100, h/100) 各轴独立缩放 —— 375×44 的子节点于是被乘 (3.75, 0.44),
  // x≥287 的飞出边界被裁掉(真机实测,见 docs/design-decisions/0044)。
  if (params.width != null || params.height != null) {
    resizeContainer(
      component,
      params.width ?? component.width,
      params.height ?? component.height,
    );
  }
  host.viewport.scrollAndZoomIntoView([component]);
  return { created: serializeNode(component) };
}

export async function createInstances(
  host: DesignHost,
  ids: string[],
): Promise<{ created: SerializedNode[] }> {
  const byId = await resolveNodesMap(host, ids);
  const components = [...byId.values()].filter((n) => n.type === 'COMPONENT');
  if (components.length === 0) {
    // 逐 id 点名:没找到的与类型不符的分开说,别让调用方猜是哪个 id 为什么不行
    const details = ids
      .map((id) => {
        const found = byId.get(id);
        return found == null
          ? `${id}:未找到(可能已删除或不在当前页)`
          : `${id}:类型为 ${found.type}(可实例化的只有 COMPONENT)`;
      })
      .join(';');
    throw new Error(`没有找到可实例化的组件节点。${details}`);
  }
  const page = host.currentPage;
  const created: NodeSkeleton[] = [];
  const center = host.viewport.center;
  const failures: { id: string; message: string }[] = [];
  for (const c of components) {
    // 引擎**实际能力**先于 typings:即时设计的 `createInstance()` 对**变体集成员**必抛
    // `in createInstance: The node with id undefined does not exist`(真机 2026-10-20,
    // 集合内成员全部复现;同为 COMPONENT 但独立于集合之外的则正常)。这是引擎缺陷,
    // 不能靠改调用方式绕过 —— 故逐组件收集失败并以富出口点名,别让整批只回一句引擎原文。
    try {
      const inst = c.createInstance();
      page.appendChild(inst);
      inst.x = center.x - inst.width / 2;
      inst.y = center.y - inst.height / 2;
      created.push(inst);
    } catch (e) {
      failures.push({
        id: c.id,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
  if (created.length === 0 && failures.length > 0) {
    const inSet = components.some((c) => c.parent?.type === 'COMPONENT_SET');
    // i18n-exempt: 随结果上行给模型,不走面板文案
    throw new Error(
      [
        `全部组件都无法生成实例:${failures.map((f) => `${f.id}(${f.message})`).join(', ')}。`,
        inSet
          ? '本次涉及的组件**在组件集里**:本引擎对变体集成员调用 createInstance 会抛 node with id undefined does not exist(真机实测,与组件内容无关)。可执行出口:① 变体实例请在画布上手工拖出 / 复制;② 用 jsd_clone_node 复制画布上**已存在的实例**(克隆实例是合法路径);③ 需要脚本可铺的实例,先让主件独立于组件集。'
          : '本引擎的 createInstance 未成功。可执行出口:jsd_clone_node 复制一个画布上已存在的实例,或在该平台客户端手工拖出实例。',
      ].join(''),
    );
  }
  if (created.length > 0) host.viewport.scrollAndZoomIntoView(created);
  return {
    created: created.map((n) => serializeNode(n)),
    ...(failures.length > 0
      ? {
          warnings: [
            // i18n-exempt: 随结果上行给模型,不走面板文案
            `部分组件没能生成实例:${failures.map((f) => `${f.id}(${f.message})`).join(', ')}`,
          ],
        }
      : {}),
  };
}

export async function swapComponents(
  host: DesignHost,
  params: { ids: string[]; componentId: string },
): Promise<{ swapped: SerializedNode[] }> {
  const component = (await resolveNodes(host, [params.componentId])).find(
    (n) => n.type === 'COMPONENT',
  );
  if (!component) {
    throw new Error(`没有找到组件: ${params.componentId}`);
  }
  const instances = (await resolveNodes(host, params.ids)).filter(
    (n) => n.type === 'INSTANCE',
  );
  if (instances.length === 0) {
    throw new Error('没有找到要交换的实例节点');
  }
  // 引擎**实际行为**先于 typings:`InstanceNode.swapComponent` 在即时设计运行期必抛
  // `in swapComponent: Cannot read properties of undefined (reading 'type')`
  // (真机 2026-10-20:独立组件之间、变体集成员之间、克隆出的实例上全部复现 ⇒ 引擎缺陷)。
  // 逐个收错、写后回读主组件,别回一句引擎原文了事;部分成功时用 warnings 点名。
  const swapped: NodeSkeleton[] = [];
  const failed: { id: string; message: string }[] = [];
  const notApplied: string[] = [];
  for (const inst of instances) {
    try {
      inst.swapComponent(component);
    } catch (e) {
      failed.push({
        id: inst.id,
        message: e instanceof Error ? e.message : String(e),
      });
      continue;
    }
    // 回读:换绑成功必须体现为 mainComponent 变了(引擎接受但没换 = 静默失效)
    try {
      const now = inst.mainComponent;
      if (now != null && now.id !== component.id) {
        notApplied.push(`${inst.id}(期望 ${component.id}、回读 ${now.id})`);
        continue;
      }
    } catch {
      // mainComponent 不可同步读:交给结果照常返回(不做判定)
    }
    swapped.push(inst);
  }
  if (swapped.length === 0 && failed.length > 0) {
    const inSet = component.parent?.type === 'COMPONENT_SET';
    // i18n-exempt: 随结果上行给模型,不走面板文案
    throw new Error(
      [
        `全部实例换绑失败:${failed.map((f) => `${f.id}(${f.message})`).join(', ')}。`,
        '本引擎运行期的 swapComponent 不可用(typings 与官方文档都声明了它,实测抛内部错误)。可执行出口:',
        inSet
          ? '① 变体切换:实例只能指向组件集里的某个成员,脚本没有可用入口 —— 请在画布上手工切换,或改用「每个状态一个独立 COMPONENT + 复制节点」;'
          : '① 目标组件若是另一个独立 COMPONENT,脚本同样换不了 —— 请在画布上手工换绑;',
        '② 需要的只是「换成另一种外观」时,jsd_detach_instance + 改样式是一条可行路径(会丢链接,但对渲染有效);',
        '③ 在支持该入口的平台上执行同一步。',
      ].join(''),
    );
  }
  if (notApplied.length > 0) {
    // i18n-exempt: 随结果上行给模型,不走面板文案
    throw new Error(
      `换绑未生效:${notApplied.join(';')}。引擎接受了调用但主组件没有变 —— 这类「回显成功、画布不动」不能当成功。`,
    );
  }
  if (swapped.length > 0) host.viewport.scrollAndZoomIntoView(swapped);
  return {
    swapped: swapped.map((n) => serializeNode(n)),
    ...(failed.length > 0
      ? {
          warnings: [
            // i18n-exempt: 随结果上行给模型,不走面板文案
            `部分实例没能换绑:${failed.map((f) => `${f.id}(${f.message})`).join(', ')}`,
          ],
        }
      : {}),
  };
}

/**
 * 组件属性的**读形态 → 写形态**映射(0023)。
 *
 * 读回来的 `componentProperties` 每项是 `{type, value}`,而引擎写侧收什么由各自签名定:
 * Figma `setProperties(properties: {[name]: string|boolean|VariableAlias})`
 * (`@figma/plugin-typings` 1.139.0 `plugin-api.d.ts:11123`)。把读形态原样回喂会被
 * 整条拒绝(`Unrecognized key(s) in object: 'value'`),且 `SLOT` 引擎明确不收
 * (`cannotSetSlotProperty`)—— 被跳过的键名进 `skipped`,由调用方点名,不静默丢。
 *
 * `value` 是变量别名(`{type:'VARIABLE_ALIAS', id}`)时**原样带上**而不是摊平成 id 字符串:
 * 摊平等于把「跟随变量」写成「值等于那串 id 文本」,是静默改语义。平台收不收别名由调用方
 * 按 `dicts/platform-value-domain.ts` 判(见 {@link setInstanceProperties} 的门)。
 *
 * 三种入参形态都收(裸字符串 / 裸布尔 / `{type,value}`),因为工具入参与覆盖快照
 * 两个来源本来就不同形。MG 门面另有一层**键归一**(名字→propertyId),与本函数不重叠。
 */
export function toComponentPropertyWrites(props: Record<string, unknown>): {
  writes: Record<string, string | boolean | VariableAliasRef>;
  skipped: string[];
} {
  const writes: Record<string, string | boolean | VariableAliasRef> = {};
  const skipped: string[] = [];
  for (const [name, raw] of Object.entries(props)) {
    if (typeof raw === 'string' || typeof raw === 'boolean') {
      writes[name] = raw;
      continue;
    }
    if (raw == null || typeof raw !== 'object') {
      skipped.push(name);
      continue;
    }
    const entry = raw as { type?: unknown; value?: unknown };
    if (entry.type === 'SLOT') {
      skipped.push(name);
      continue;
    }
    if (isVariableAliasRef(entry.value)) {
      writes[name] = entry.value;
      continue;
    }
    if (typeof entry.value === 'string' || typeof entry.value === 'boolean') {
      writes[name] = entry.value;
      continue;
    }
    skipped.push(name);
  }
  return { writes, skipped };
}

/** 变量别名形态的判定(线格式见 `schemas/platform.ts` 的 variableAliasRefSchema) */
function isVariableAliasRef(value: unknown): value is VariableAliasRef {
  const v = value as { type?: unknown; id?: unknown } | null;
  return (
    v != null &&
    typeof v === 'object' &&
    v.type === 'VARIABLE_ALIAS' &&
    typeof v.id === 'string'
  );
}

/**
 * 要绑变量的属性落到不收变量别名的平台时,当场点名中止(不写半批)。
 * 判据来自 `dicts/platform-value-domain.ts` 的第四类表,与 `core/props/platform-gate.ts`
 * 同源(0022);错误文案自带替代路径(0007)。
 */
function rejectUnsupportedAlias(
  ctx: RuntimeContext,
  aliasKeys: readonly string[],
): void {
  if (aliasKeys.length === 0) return;
  if (
    platformMethodParamAllowed(ctx.platform, 'setProperties', 'variableAlias')
  )
    return;
  // i18n-exempt: 随结果上行给模型,不走面板文案
  throw new Error(
    `属性 ${aliasKeys.join('、')} 要绑变量,但 ${
      ctx.platform == null ? '当前平台' : PLATFORM_LABEL[ctx.platform]
    } 的 setProperties 签名不收变量别名(只有 Figma 收,见 plugin-api.d.ts:11123)。请改传标量值,或把这条留给 Figma 侧执行。`,
  );
}

/** 写形态里哪些键的值是变量别名(即「这个属性要跟随变量」) */
function aliasKeysOf(
  writes: Record<string, string | boolean | VariableAliasRef>,
): string[] {
  return Object.keys(writes).filter(
    (k) => (writes[k] as VariableAliasRef)?.type === 'VARIABLE_ALIAS',
  );
}

/** `标题#32:0` → `标题`;没有 `#` 的键原样返回(基名即自身) */
function basePropertyName(key: string): string {
  const at = key.lastIndexOf('#');
  return at > 0 ? key.slice(0, at) : key;
}

/**
 * 组件属性**键**归一(0041):把调用方给的短名补成实例上的完整键。
 *
 * 为什么需要:引擎对**组件属性**(BOOLEAN / TEXT / INSTANCE_SWAP)只认带唯一后缀的
 * 完整键。Figma 真机实测,短名一律
 * `in setProperties: Could not find a component property with name: '标题'` ——
 * 免后缀只对**变体属性**成立(`variantProperties` 是另一张表),而 0023 已经把
 * **值**形态收成「一份知识只写一处」,键形态却从没归属:实现里只有 MG 门面做了归一
 * (`mastergo/node-facade.ts`),且那里自承只兜得住 BOOLEAN/TEXT。这里补齐三个平台。
 *
 * 四条纪律,同 0007「不允许静默失效」:
 * - 精确命中 → 保留(不做任何改写);
 * - 基名**唯一**命中 → 改写成完整键;
 * - 命中 **0 个** → **原样透传**。这一支不能报错:变体属性不在 `componentProperties`
 *   里,而 MG 的实例侧属性表实测经常是空的 —— 按「查不到就拒」会把这两类合法调用
 *   一起打死(那些键本来就该按原样落到引擎);
 * - 命中 **≥2 个** → 抛错并列出候选。歧义时替调用方挑一个,等于往写路径里引进
 *   「回包成功、改错了别的东西」,比报错差得多。
 *
 * 泛型只为免去调用方的类型断言:走一圈不改形态。
 */
export function normalizeComponentPropertyKeys<T>(
  props: Record<string, T>,
  known: Record<string, unknown> | undefined,
): Record<string, T> {
  const knownKeys = known == null ? [] : Object.keys(known);
  if (knownKeys.length === 0) return props; // 没有表可对:不介入
  const byBaseName = new Map<string, string[]>();
  for (const key of knownKeys) {
    const base = basePropertyName(key);
    const bucket = byBaseName.get(base);
    if (bucket == null) byBaseName.set(base, [key]);
    else if (!bucket.includes(key)) bucket.push(key);
  }
  const out: Record<string, T> = {};
  const ambiguous: string[] = [];
  for (const [name, value] of Object.entries(props)) {
    if (knownKeys.includes(name)) {
      out[name] = value;
      continue;
    }
    const candidates = byBaseName.get(name);
    if (candidates == null || candidates.length === 0) {
      out[name] = value;
      continue;
    }
    if (candidates.length > 1) {
      ambiguous.push(`${name}(候选:${candidates.join('、')})`);
      continue;
    }
    out[candidates[0] as string] = value;
  }
  if (ambiguous.length > 0) {
    // i18n-exempt: 随结果上行给模型,不走面板文案
    throw new Error(
      `组件属性名有歧义,请传完整键:${ambiguous.join(';')}。本实例可选:${knownKeys.join('、')}`,
    );
  }
  return out;
}

/** 引擎沙箱是 target=es6,不注入 ES2022 的 `Object.hasOwn`(见 tests/engine-api-compat) */
function hasKnown(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * 读实例上的属性表,读不到就当没有(不归一)。
 *
 * 属性表是**摘要性质**:某些节点/平台 getter 会抛(`componentProperties` 在原型上
 * 可能不存在,MG 实例侧实测常为空)。只读失败不该变成写失败 —— 退回「原样透传」
 * 与 0023 对坏节点的处置同向。
 */
function knownPropertyKeys(
  inst: NodeSkeleton,
): Record<string, unknown> | undefined {
  try {
    return inst.componentProperties as Record<string, unknown> | undefined;
  } catch {
    return undefined;
  }
}

/**
 * 设置实例的变体/组件属性。
 *
 * `properties` 是**宽类型**(字符串 | 布尔 | `ComponentPropertyValue`),与契约
 * `DesignHost.setProperties` 的签名一致:变体属性是字符串,布尔/文本/换绑属性是标量,
 * 需要显式类型或换绑候选时才传对象,值要跟随变量时 `value` 传 `VariableAliasRef`。
 * 收下来的形态再走 {@link toComponentPropertyWrites} 整成写形态(0023);键走
 * {@link normalizeComponentPropertyKeys} 补成完整键(0041);MG 的名字→propertyId 归一在门面里(见 0017)。
 *
 * 「本平台收不收这种值形态」不在这里手写:查 `dicts/platform-value-domain.ts`
 * 的第四类表(`PLATFORM_METHOD_PARAM_DOMAIN`),与 `core/props/platform-gate.ts`
 * 的属性写路径同一张表、同一个判据(0022:判定要有归属,门面里 console.warn 不算)。
 */
export async function setInstanceProperties(
  host: DesignHost,
  ctx: RuntimeContext,
  params: {
    ids: string[];
    properties: Record<
      string,
      string | boolean | ComponentPropertyValue | ComponentPropertyAliasValue
    >;
  },
): Promise<{ updated: SerializedNode[] }> {
  const instances = (await resolveNodes(host, params.ids)).filter(
    (n) => n.type === 'INSTANCE',
  );
  if (instances.length === 0) {
    throw new Error('没有找到要设置的实例节点');
  }
  const { writes, skipped } = toComponentPropertyWrites(params.properties);
  if (Object.keys(params.properties).length > 0 && skipped.length > 0) {
    // i18n-exempt: 随结果上行给模型,不走面板文案
    throw new Error(
      `属性 ${skipped.join('、')} 的值形态无法写成标量(SLOT 属性引擎不收,或值缺少 value)。请用 jsd_find 回读该实例的 componentProperties 取合法项后重试。`,
    );
  }
  rejectUnsupportedAlias(ctx, aliasKeysOf(writes));
  // 运行时校验 + 键归一:**两遍**走,先把每个实例要写的键算完,再统一下笔。
  // 为什么分两遍:归一的歧义必须**在任何一次写入之前**报出来 —— 否则第一个实例
  // 已经写完、第二个实例才抛,等于留了半批覆盖(0041「不确定就点名,绝不猜」)。
  const planned: Array<{
    inst: NodeSkeleton;
    props: Record<string, string | boolean | VariableAliasRef>;
  }> = [];
  for (const inst of instances) {
    // 引擎**实际类型**先于声明:typings 与官方文档都有 `InstanceNode.setProperties`
    // (`plugin-api.d.ts:1093`),即时设计运行期该成员**不是函数**(真机 2026-10-20:
    // `in setProperties: i.setProperties is not a function`)。这是「符号在 ≠ 能调」
    // 的又一例(见 0010 / 0043 / e1e66f0a),行为检测而不是按平台名分支。
    if (
      typeof (inst as { setProperties?: unknown }).setProperties !== 'function'
    ) {
      // i18n-exempt: 随结果上行给模型,不走面板文案
      throw new Error(
        `实例 ${inst.id} 的引擎对象上没有可调用的 setProperties —— 本平台运行期未实现实例属性写入(typings 声明了它,实测是 not a function)。可执行出口:① 变体取值只能在画布上手工切换;② 需要脚本可写的多状态,改用「每个状态各建一个独立 COMPONENT」;③ 在声明了组件属性的平台上(见 jsd_ping 的 capabilities 含 componentProperties)执行同一步。`,
      );
    }
    // dynamic-page 下 inst.mainComponent 直接抛,必须走异步入口(0011)
    const main = await resolveMainComponent(inst, ctx);
    const compSet = main?.parent;
    // 变体取值有两张表:实例/成员上的 variantProperties(引擎写入口认	extbf{这套键})
    // 与组件集上的 variantGroupProperties(维度 → 可选值)。两者**可能不是同一套键**
    // (真机 2026-10-20:集合 `状态`、成员 `分类1`),故两边都收(见 core/variant.ts)。
    const setDimensions =
      compSet != null && compSet.type === 'COMPONENT_SET'
        ? normalizeVariantGroupProperties(compSet.variantGroupProperties)
        : undefined;
    const variantProps = setDimensions;
    if (variantProps) {
      const validKeys = [
        ...Object.keys(variantProps),
        ...Object.keys(
          (inst.variantProperties as
            | Record<string, string>
            | null
            | undefined) ?? {},
        ),
      ];
      const invalidKeys = Object.keys(params.properties).filter(
        (k) =>
          !validKeys.includes(k) && !validKeys.includes(basePropertyName(k)),
      );
      if (invalidKeys.length > 0) {
        throw new Error(
          `非法变体属性:${invalidKeys.join(',')}。合法属性:${validKeys.join(',')}`,
        );
      }
    }
    // 属性面为空的平台,写前点名拒。真机 2026-10-19(即时设计):未知属性名一路落到
    // `setProperties` 会让插件挂满 25s 才超时,错误只回「插件响应超时」,调用方分不清
    // 「名字写错」与「平台没有这个面」。typings 事实:jsDesign 的 `InstanceNode` **没有**
    // `componentProperties`, `setProperties(properties: {[k]: string})` 只收 string
    // (plugin-api.d.ts:1088-1093)⇒ 布尔 / 文本 / 换绑属性本平台根本没有入口,变体属性
    // 也只在已存在的变体集里才有维度。能力位明确说不支持时才拦(Figma / MG 声明了 → 不介入)。
    const known = knownPropertyKeys(inst);
    if (hostCapabilityState(ctx, 'componentProperties') === false) {
      const validKeys = [
        ...Object.keys(variantProps ?? {}),
        ...Object.keys(known ?? {}),
        ...Object.keys(inst.variantProperties ?? {}),
      ];
      // i18n-exempt: 随结果上行给模型,不走面板文案
      if (validKeys.length === 0) {
        throw new Error(
          `实例 ${inst.id} 没有可写的属性面:${
            ctx.platform == null ? '当前平台' : PLATFORM_LABEL[ctx.platform]
          } 的 InstanceNode 没有 componentProperties,setProperties 只收 string,该实例也不在变体集里 —— 写任何属性名都只会落到引擎空转(实测 25s 超时、错误不带原因)。布尔 / 文本 / 换绑属性本平台没有入口;变体属性只能改已存在变体集里的维度`,
        );
      }
      const invalidKeys = Object.keys(params.properties).filter(
        (k) =>
          !validKeys.includes(k) && !validKeys.includes(basePropertyName(k)),
      );
      if (invalidKeys.length > 0) {
        throw new Error(
          `非法属性名:${invalidKeys.join(',')}。本实例可写:${validKeys.join(',')}`,
        );
      }
    }
    // 变体值有两套键:引擎写入口认**成员键**(inst.variantProperties),而调用方
    // 常拿到的是**集合维度键**(组件集上的 variantGroupProperties)。真机 2026-10-20:
    // 集合读作 `状态`、成员却是 `分类1` —— 只按集合键校验会把合法的成员键写入拒掉。
    // 故两边都收,集合维度键按**取值唯一匹配**映射到成员键(歧义 / 无匹配点名,绝不猜)。
    const memberValues =
      (inst.variantProperties as Record<string, string> | null | undefined) ??
      undefined;
    const resolved: Record<string, string | boolean | VariableAliasRef> = {};
    const visited = new Set<string>();
    for (const [key, value] of Object.entries(writes)) {
      // ① 组件属性(布尔/文本/换绑):键归一后原样下发(0041)。
      // `known` 为 undefined 表示**读不到属性表**,不能据此把任意键当组件属性 ——
      // 那样变体键会被错误归进这条分支,写入永远打不中。
      if (known != null) {
        const normalized = normalizeComponentPropertyKeys(
          { [key]: value },
          known,
        );
        const target = Object.keys(normalized)[0];
        if (target != null && hasKnown(known, target)) {
          resolved[target] = value;
          visited.add(key);
          continue;
        }
      }
      // ② 变体属性:成员键直接命中,集合维度键按取值映射成成员键
      const mapped = resolveVariantWriteKey(
        key,
        String(value),
        memberValues,
        setDimensions,
      );
      if (mapped != null && 'key' in mapped) {
        if (typeof value !== 'string') {
          throw new Error(
            `变体属性 ${key} 的值必须是字符串(收到 ${typeof value});变体取值本身就是字符串`,
          );
        }
        if (
          !variantValueOffered(
            value,
            setDimensions?.[mapped.rewrittenFrom ?? key],
          )
        ) {
          throw new Error(
            `变体属性 ${key}=${value} 不在组件集的可选值里(可选:${(setDimensions?.[mapped.rewrittenFrom ?? key] ?? []).join('、')})`,
          );
        }
        resolved[mapped.key] = value;
        visited.add(key);
        continue;
      }
      if (mapped != null && 'error' in mapped) {
        throw new Error(mapped.error);
      }
      // ③ 都没命中:能力位**未注入**时保持 fail-open,原样透传(历史行为,不误报);
      // 只有平台明确声明不支持组件属性时,才把未知键判成非法并点名。
      if (hostCapabilityState(ctx, 'componentProperties') !== false) {
        resolved[key] = value;
        visited.add(key);
        continue;
      }
      const validKeys = [
        ...Object.keys(memberValues ?? {}),
        ...Object.keys(setDimensions ?? {}),
        ...Object.keys(known ?? {}),
      ];
      // i18n-exempt: 随结果上行给模型,不走面板文案
      if (validKeys.length === 0) {
        throw new Error(
          `实例 ${inst.id} 没有可写的属性面:${
            ctx.platform == null ? '当前平台' : PLATFORM_LABEL[ctx.platform]
          } 的 InstanceNode 没有 componentProperties,setProperties 只收 string,该实例也不在变体集里 —— 写任何属性名都只会落到引擎空转(实测 25s 超时、错误不带原因)。布尔 / 文本 / 换绑属性本平台没有入口;变体属性只能改已存在变体集里的维度`,
        );
      }
      throw new Error(`非法属性名:${key}。本实例可写:${validKeys.join(',')}`);
    }
    planned.push({ inst, props: resolved });
  }
  for (const { inst, props } of planned) {
    inst.setProperties(props);
  }
  // 写后回读:引擎「回包成功、值没变」比报错更糟(0007)。逐实例比对变体取值,
  // 不一致就点名 —— 本平台确实有过静默无效的同类缺陷(MG 的实例侧变体写入)。
  const notApplied: string[] = [];
  for (const { inst, props } of planned) {
    let now: Record<string, string> | undefined;
    try {
      now =
        (inst.variantProperties as Record<string, string> | null | undefined) ??
        undefined;
    } catch {
      now = undefined;
    }
    if (now == null) continue;
    for (const [k, v] of Object.entries(props)) {
      if (typeof v !== 'string') continue;
      if (hasKnown(now, k) && now[k] !== v) {
        notApplied.push(`${inst.id}:${k} 期望 ${v}、回读 ${now[k]}`);
      }
    }
  }
  if (notApplied.length > 0) {
    // i18n-exempt: 随结果上行给模型,不走面板文案
    throw new Error(
      `变体属性写入未生效:${notApplied.join(';')}。引擎接受了调用但取值没有变 —— 这类「回显成功、画布不动」不能当成功。请改用 jsd_swap_component 换绑到目标成分(若本平台支持),或在画布上手工切换。`,
    );
  }
  return { updated: instances.map((n) => serializeNode(n)) };
}

export async function importComponentNodes(
  host: DesignHost,
  params: { key: string; name?: string },
): Promise<{ created: SerializedNode }> {
  const component = await host.importComponentByKeyAsync(params.key);
  const page = host.currentPage;
  page.appendChild(component);
  const center = host.viewport.center;
  component.x = center.x - component.width / 2;
  component.y = center.y - component.height / 2;
  if (params.name != null) component.name = params.name;
  host.viewport.scrollAndZoomIntoView([component]);
  return { created: serializeNode(component) };
}

/**
 * 校验 `combineAsVariants` 的返回值**真的是 COMPONENT_SET**。
 *
 * 为什么必须显式验:typings 声明返回 `ComponentSetNode`
 * (`@jsdesigndeveloper/plugin-typings@1.0.12 plugin-api.d.ts:127`),契约把它放宽成
 * `NodeSkeleton` —— 于是「返回类型对不对」在两处都**没有编译期信号**。
 * 真机 2026-10-20(即时设计)实测:调用**成功返回**、`name` 也能设上,但对象的
 * `type` 是 **`BOOLEAN_OPERATION`** —— 引擎把「合并组件」路由到了布尔运算的实现。
 *
 * 只做「调用有没有抛」的判断会把这种假成功当成功:回包 `created` 里躺着一个布尔
 * 节点,画布上却没有变体集 —— 正是 0007 那类「回显成功、实际没发生」。
 * 故按**实际类型**分流,非 COMPONENT_SET 一律当失败。
 */
function requireComponentSet(s: NodeSkeleton | null | undefined): NodeSkeleton {
  if (s == null) {
    throw new Error(
      'combineAsVariants 未返回节点(引擎返回了 null / undefined)',
    );
  }
  const type = (s as { type?: unknown }).type;
  if (type !== 'COMPONENT_SET') {
    throw new Error(
      `引擎返回的不是 COMPONENT_SET(实际 type=${String(type)})—— combineAsVariants 在运行期被路由到了别的实现,这是平台缺陷`,
    );
  }
  return s;
}

export async function combineAsVariantsNodes(
  host: DesignHost,
  ctx: RuntimeContext,
  params: { ids: string[]; name?: string },
): Promise<{ created: SerializedNode }> {
  const components = (await resolveNodes(host, params.ids)).filter(
    (n) => n.type === 'COMPONENT',
  );
  if (components.length < 2) {
    throw new Error('combine_as_variants 至少需要 2 个组件节点');
  }
  const errText = (e: unknown): string =>
    e instanceof Error ? e.message : String(e);

  // ── 快速失败:平台未声明 inPlaceVariants ⇒ 合并路径不可用,不落引擎 ──────────
  //
  // 判据用**能力位**而非平台名(0032):Figma / MasterGo 声明了 inPlaceVariants,
  // 行为不变;将来本平台若修好并声明该能力位,这一支自动失效。
  //
  // 为什么敢直接拒(2026-10-20 真机逐层取证,七条独立证据):
  // · 裸调(取消全部前置判断、直接交 4 个真 COMPONENT)返回 type=BOOLEAN_OPERATION,
  //   并把入参组件**搬进该布尔节点下**(原画板随即变空);读它抛 in get_name: Value
  //   is not a string。⇒ 引擎把「合并组件」路由到了布尔运算实现。
  // · 参数本身完全合规:探针核对入参就是原生 ComponentNode(=== jsDesign.getNodeById),
  //   parent 是真实容器,满足 combineAsVariants(nodes: ReadonlyArray<ComponentNode>,
  //   parent: BaseNode & ChildrenMixin) 的签名。
  // · 同类缺陷在 flatten 上同形:flatten(RECTANGLE) 成功、flatten(COMPONENT) 抛
  //   node with id undefined —— 与 adapter / receiver / as never 都无关(flatten
  //   在 adapter 里根本没有覆写)。
  // · 已排除:receiver 绑法、组件命名、带子层、先 reparent 进 FRAME、画布污染、
  //   克隆返回 INSTANCE 的入参类型问题(单姿势隔离实验)。
  //
  // 既然确定做不出来,就不能再跑两条克隆姿势:克隆拿到的是 INSTANCE(不是
  // combineAsVariants 要的 ComponentNode),必然失败,白耗 100ms+ 且每次失败都可能
  // 留下 BOOLEAN_OPERATION 残骸、把用户组件搬走。
  if (hostCapabilityState(ctx, 'inPlaceVariants') !== true) {
    // i18n-exempt: 随结果上行给模型,不走面板文案
    throw new Error(
      [
        'combine_as_variants 在本平台做不出来,已在调用引擎前中止(不再重试、不留残骸)。',
        '根因(真机 2026-10-20,已逐层排除):引擎把「合并组件」路由到了布尔运算实现 —— 裸调(取消全部前置判断、直接交 4 个真 COMPONENT)返回 type=BOOLEAN_OPERATION,并把入参组件搬进该布尔节点、原画板变空;读取它还会抛 in get_name: Value is not a string。同类缺陷在 flatten 上同形(flatten(RECTANGLE) 正常、flatten(COMPONENT) 抛 node with id undefined)。',
        '参数本身没有问题:探针核对入参就是原生 ComponentNode 对象(=== jsDesign.getNodeById(id)),parent 是真实容器(FrameNode / PageNode),完全满足 combineAsVariants(nodes: ReadonlyArray<ComponentNode>, parent: BaseNode & ChildrenMixin) 的签名。',
        '可执行出口:① 在画布上手动合并(引擎 UI 走另一套实现,可用;文档里已有的变体集就是这样建的);② 每个状态各建一个独立 COMPONENT,按「族名 / 状态」命名(如 登录状态 / 未登录、登录状态 / 已登录)—— 这也是本平台登记在平台事实表里的替代路径;③ 换到声明了 inPlaceVariants 的引擎(如 Figma)执行同一步。',
        '⚠ 别为了「让合并跑通」去改组件结构 —— 结构合规与否与本缺陷无关(已用合规组件复现)。',
      ].join(''),
    );
  }

  /**
   * 解析合并落点的父容器(**必须是真实的 BaseNode & ChildrenMixin**)。
   *
   * 为什么不能 `components[0].parent ?? page` 兜底:原生签名要的是
   * `BaseNode & ChildrenMixin`(`plugin-api.d.ts:127`),而 `parent` 为 null 只有两种
   * 可能,**两种都不该静默拿 page 顶**:
   * ① 节点是页面顶层 —— 那它的父级是 **PageNode**,不是 null;读不到 parent 说明
   *    Access 层没解析出来(或节点已失效),这时拿 page 顶等于**猜**;
   * ② 节点已不在任何父级下(失效/孤立)—— 拿 page 顶会把它挂到别处,是**改结构**。
   *
   * 而且落点变了会**静默改几何**:全局坐标不变、但相对坐标基准从原容器换成页面,
   * 集合位置看着对、子件位置全错 —— 正是 0007 那类「回显成功、实际不对」。
   * 故这里只接受**真实容器**(有 appendChild),拿不到就点名报错。
   */
  const resolveCombineParent = (): ContainerSkeleton => {
    const orphans = new Set<string>();
    for (const c of components) {
      const parent = c.parent;
      if (parent == null || typeof parent.appendChild !== 'function') {
        orphans.add(`${c.name}(${c.id})`);
      }
    }
    if (orphans.size > 0) {
      // i18n-exempt: 随结果上行给模型,不走面板文案
      throw new Error(
        `组件没有可用的父容器,无法确定变体集落点:${[...orphans].join('、')}。原生 combineAsVariants 要求 parent 是 BaseNode & ChildrenMixin(真实容器),不接受 null —— 用当前页兜底会静默改坐标基准。可执行出口:先用 jsd_find 确认这些组件仍在画布上(可能已被删除或处于失效状态),必要时 jsd_manage_nodes op=repair 清理后重试。`,
      );
    }
    // 同父级校验:Figma 官方语义要求待合并组件在**同一父级**下;跨父级时
    // `components[0].parent` 只代表第一个组件的落点,其余组件的相对坐标基准不同,
    // 合并结果不可预期。这里点名,不替调用方选。
    const first = components[0]?.parent;
    const firstId = first?.id ?? '';
    const strays = components.filter((c) => (c.parent?.id ?? '') !== firstId);
    if (strays.length > 0) {
      // i18n-exempt: 随结果上行给模型,不走面板文案
      throw new Error(
        `待合并的组件不在同一父级下,无法确定变体集落点:基准是 ${first?.name ?? '(未知)'}(${firstId || '无'}),但 ${strays.map((c) => `${c.name}(${c.id}) 在 ${c.parent?.name ?? '无父级'}`).join('、')}。请先用 jsd_reparent_nodes 把它们移到同一父级(parentId 显式传)再合并 —— 跨父级合并会让相对坐标基准不一致,结果不可预期。`,
      );
    }
    return first as ContainerSkeleton;
  };

  const combineParent = resolveCombineParent();

  // 走到这里说明平台声明了 inPlaceVariants。该能力位的语义就是「原生合并即原位
  // 合并」:并入集合的是实例所指的 COMPONENT 本身,已有实例链接不断、页面不残留
  // 冗余原件。故只需一种姿势,不再保留克隆兜底(那是为 jsDesign 准备的,而那条
  // 路径已被上面的前置守卫拦掉;克隆拿到的是 INSTANCE,交过去必败)。
  let set: NodeSkeleton | undefined;
  try {
    const s = host.combineAsVariants(components, combineParent);
    if (params.name != null && s != null) s.name = params.name;
    if (s != null) serializeNode(s); // 探活:任何引擎 getter 抛都归本姿势
    set = requireComponentSet(s);
  } catch (e) {
    const names = components.map((c) => `${c.name}(${c.id})`).join('、');
    // 平台声明了原位合并却仍失败:按调用与节点状态排查,不要套用「引擎做不出来」
    // 的结论去改组件结构(与上面 jsDesign 的前置拒绝是两种处境)。
    // i18n-exempt: 随结果上行给模型,不走面板文案
    throw new Error(
      [
        'combine_as_variants 失败:本平台声明支持原位合并(inPlaceVariants),但本次调用失败。',
        `引擎报错:${errText(e)}。`,
        `本次涉及的组件:${names}。`,
        '排查方向:①组件是否跨页 / 跨父级;②是否已被并入别的组件集;③组件是否处于错误状态(可先 jsd_repair_nodes 清理);④组件名是否符合「属性=值」、多属性用 ", " 分隔。',
      ].join(''),
    );
  }
  host.viewport.scrollAndZoomIntoView([set]);
  return { created: serializeNode(set) };
}

/** mainComponent 可安全触碰(读属性不崩)才算活着;僵尸引用会让引擎解绑时内部崩溃 */
async function mainComponentAlive(
  n: NodeSkeleton,
  ctx: RuntimeContext,
): Promise<boolean> {
  const main = await resolveMainComponent(n, ctx);
  return main != null && typeof main.id === 'string';
}

/**
 * jsDesign 引擎 detachInstance 偶发内部崩溃(t.get is not a function),
 * 多见于被 setProperties/swapComponent 改过覆盖的原节点。副本兜底:
 * 克隆到原位(引擎侧干净状态)解绑副本,删原实例,几何不变。
 */
function detachWithRecovery(inst: NodeSkeleton): NodeSkeleton {
  let firstMsg = '';
  try {
    return inst.detachInstance();
  } catch (firstErr) {
    firstMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
  }
  // 副本兜底:克隆插回原位(引擎侧干净状态)再解绑,成功后删原实例
  let clone: NodeSkeleton | undefined;
  try {
    const parent = inst.parent;
    if (!parent) throw new Error('实例无父节点,副本无处安放');
    const index =
      'children' in parent
        ? (parent.children ?? []).findIndex((c) => c.id === inst.id)
        : -1;
    clone = inst.clone();
    if (index >= 0 && 'insertChild' in parent) {
      parent.insertChild(index, clone);
    } else {
      parent.appendChild(clone);
    }
    const frame = clone.detachInstance();
    clone = undefined; // 已转为 frame,不再清理
    inst.remove();
    return frame;
  } catch (retryErr) {
    // 半途而废时删掉克隆,避免画布残留重复实例
    try {
      clone?.remove();
    } catch {}
    const retryMsg =
      retryErr instanceof Error ? retryErr.message : String(retryErr);
    throw new Error(
      `实例 ${inst.id} 解绑失败(直接:${firstMsg};副本兜底:${retryMsg})。可尝试先 repair,或在画布中选中后用快捷键 Ctrl/⌘+Alt+B 手动分离`,
    );
  }
}

// detachWithRecovery 不需要 host:克隆先插回原父级再解绑
export async function detachInstanceNodes(
  host: DesignHost,
  ctx: RuntimeContext,
  ids: string[],
): Promise<{
  created: SerializedNode[];
  failed: { id: string; message: string }[];
}> {
  const instances = (await resolveNodes(host, ids)).filter(
    (n) => n.type === 'INSTANCE',
  );
  if (instances.length === 0) {
    throw new Error('没有找到要解绑的实例节点');
  }
  const detached: NodeSkeleton[] = [];
  const failed: { id: string; message: string }[] = [];
  for (const inst of instances) {
    if (!(await mainComponentAlive(inst, ctx))) {
      failed.push({
        id: inst.id,
        message:
          'mainComponent 已失效,无法解绑。建议先运行 repair 清理失效节点',
      });
      continue;
    }
    try {
      // 解绑**必须验证结果类型**:typings 的签名是 `detachInstance(): FrameNode`
      // (`plugin-api.d.ts:1094`),而即时设计运行期它**原位返回同一个 INSTANCE**
      // (真机 2026-10-20:调用后 type 仍是 INSTANCE、mainComponentId 照旧) —— 也就是
      // 一个静默 no-op。回包说 created、画布上却还是实例,正是 0007 那类「回显成功、
      // 实际没发生」,必须点名而不是把它当成功返回。
      const result = detachWithRecovery(inst);
      if (result.type === 'INSTANCE') {
        failed.push({
          id: inst.id,
          message:
            '引擎未真正解绑:detachInstance 返回的仍是 INSTANCE(typings 声明返回 FrameNode,运行期是 no-op,主组件链接照旧)',
        });
        continue;
      }
      detached.push(result);
    } catch (e) {
      failed.push({
        id: inst.id,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
  if (detached.length === 0 && failed.length > 0) {
    throw new Error(
      `全部实例解绑失败:${failed.map((f) => `${f.id}(${f.message})`).join(', ')}`,
    );
  }
  if (detached.length > 0) {
    host.viewport.scrollAndZoomIntoView(detached);
  }
  return { created: detached.map((n) => serializeNode(n)), failed };
}

// ---- 实例覆盖复制/套用(对齐参考实现的 get/set_instance_overrides) ----

/** 实例覆盖快照:插件进程内缓存,不落 MCP 线格式(仅摘要回传模型) */
export interface OverrideSnapshot {
  sourceId: string;
  sourceName: string;
  /** 源组件的 COMPONENT 节点 id:swapToSource 在源实例被删后仍可定位组件 */
  mainComponentId?: string;
  /** 变体属性(跨平台) */
  variantProperties?: Record<string, string>;
  /** Figma 组件属性(仅该平台存在,in 守卫天然跳过其他平台) */
  componentProperties?: Record<string, ComponentPropertyValue>;
  /** 可见属性子集(fills/文本/圆角/效果/描边等,不含几何与命名) */
  props?: UpdateNodeProps;
}

/** 复制结果的摘要(只回传键名,不回传大体积值) */
export interface OverrideSummary {
  variantProperties?: Record<string, string>;
  componentProperties?: Record<string, ComponentPropertyValue>;
  propsSummary?: string[];
}

/** 单实例套用结果 */
export interface AppliedOverride {
  instanceId: string;
  instanceName: string;
  ok: boolean;
  message?: string;
}

/** 插件侧缓存:copy 覆盖同 key;上限 20 条逐出最旧;插件进程重启即清空 */
const OVERRIDE_CACHE_MAX = 20;
const overrideCache = new Map<string, OverrideSnapshot>();

export function getCachedOverride(
  sourceId: string,
): OverrideSnapshot | undefined {
  return overrideCache.get(sourceId);
}

function cachePut(snapshot: OverrideSnapshot): void {
  overrideCache.set(snapshot.sourceId, snapshot);
  if (overrideCache.size > OVERRIDE_CACHE_MAX) {
    const oldest = overrideCache.keys().next().value;
    if (oldest != null) overrideCache.delete(oldest);
  }
}

function toSummary(snapshot: OverrideSnapshot): OverrideSummary {
  return {
    ...(snapshot.variantProperties != null
      ? { variantProperties: snapshot.variantProperties }
      : {}),
    ...(snapshot.componentProperties != null
      ? { componentProperties: snapshot.componentProperties }
      : {}),
    ...(snapshot.props != null
      ? { propsSummary: Object.keys(snapshot.props) }
      : {}),
  };
}

/** 从实例采集可见属性子集:只同步样式/文本,不动位置与命名 */
function captureVisibleProps(node: NodeSkeleton): UpdateNodeProps | undefined {
  const props: Record<string, unknown> = {};
  if (node.type === 'TEXT') {
    if (node.characters != null) props.characters = node.characters;
    if (node.fontSize != null && node.fontSize !== MIXED)
      props.fontSize = node.fontSize;
    if (node.fontName != null && node.fontName !== MIXED)
      props.fontName = node.fontName;
  }
  if ('fills' in node && Array.isArray(node.fills)) props.fills = node.fills;
  if ('effects' in node && Array.isArray(node.effects))
    props.effects = node.effects;
  if (node.strokeWeight != null) props.strokeWeight = node.strokeWeight;
  if (node.strokeAlign != null) props.strokeAlign = node.strokeAlign;
  if (node.blendMode != null) props.blendMode = node.blendMode;
  if (typeof node.opacity === 'number') props.opacity = node.opacity;
  if (node.cornerRadius != null) props.cornerRadius = node.cornerRadius;
  if (node.topLeftRadius != null) props.topLeftRadius = node.topLeftRadius;
  if (node.topRightRadius != null) props.topRightRadius = node.topRightRadius;
  if (node.bottomLeftRadius != null)
    props.bottomLeftRadius = node.bottomLeftRadius;
  if (node.bottomRightRadius != null)
    props.bottomRightRadius = node.bottomRightRadius;
  return Object.keys(props).length > 0 ? (props as UpdateNodeProps) : undefined;
}

async function captureOverrideSnapshot(
  host: DesignHost,
  ctx: RuntimeContext,
  sourceId: string,
  includeVisibleProps: boolean,
): Promise<OverrideSnapshot> {
  const source = (await resolveNodes(host, [sourceId])).find(
    (n) => n.type === 'INSTANCE',
  );
  if (!source) {
    throw new Error(`没有找到源实例: ${sourceId}`);
  }
  // dynamic-page 下 mainComponent 只能异步取(0011)
  const main = await resolveMainComponent(source, ctx);
  if (main == null) {
    throw new Error(
      `源实例 ${sourceId} 的 mainComponent 已失效,无法复制覆盖。建议先 jsd_manage_nodes op=repair 清理后重试`,
    );
  }
  const snapshot: OverrideSnapshot = {
    sourceId,
    sourceName: source.name,
    mainComponentId: main.id,
    ...(source.variantProperties != null &&
    Object.keys(source.variantProperties).length > 0
      ? { variantProperties: { ...source.variantProperties } }
      : {}),
    ...('componentProperties' in source &&
    source.componentProperties != null &&
    Object.keys(source.componentProperties).length > 0
      ? { componentProperties: { ...source.componentProperties } }
      : {}),
    ...(includeVisibleProps ? { props: captureVisibleProps(source) } : {}),
  };
  return snapshot;
}

/** 把快照套用到目标实例:可选 swap → 变体/组件属性 → 可见属性。逐条 try/catch */
async function applyOverrideSnapshot(
  host: DesignHost,
  ctx: RuntimeContext,
  snapshot: OverrideSnapshot,
  ids: string[],
  swapToSource: boolean,
): Promise<{
  applied: AppliedOverride[];
  total: number;
  source: OverrideSummary;
  warnings?: string[];
}> {
  const applied: AppliedOverride[] = [];
  // 因 `swapToSource:false` 而没套的变体属性名(逐实例去重后统一出一条告警)
  const skippedIdentity: string[] = [];
  // 批量预解析(0011):循环内不再逐个 await,避免 N+1
  const targets = await resolveNodesMap(host, ids);
  const mainId = snapshot.mainComponentId;
  const mains =
    swapToSource && mainId != null
      ? await resolveNodesMap(host, [mainId])
      : new Map<string, NodeSkeleton>();
  for (const targetId of ids) {
    try {
      const hit = targets.get(targetId);
      const target = hit != null && hit.type === 'INSTANCE' ? hit : undefined;
      if (!target) {
        applied.push({
          instanceId: targetId,
          instanceName: '',
          ok: false,
          message: '实例不存在或已失效',
        });
        continue;
      }
      if (swapToSource && mainId != null) {
        const hit = mains.get(mainId);
        const main = hit != null && hit.type === 'COMPONENT' ? hit : undefined;
        if (!main) {
          applied.push({
            instanceId: targetId,
            instanceName: target.name,
            ok: false,
            message: '源组件已失效,无法 swapToSource',
          });
          continue;
        }
        target.swapComponent(main);
      }
      // Figma 有 componentProperties 时走部分更新(整体赋值会重置其余属性且新版只读);
      // 否则(jsDesign)走跨平台变体属性。两者都经 setProperties 部分更新语义合并,
      // 且**一律先归一到写形态**(引擎只收标量,见 0023)。
      //
      // 变体身份(目标是哪个变体)只在调用方显式 `swapToSource: true` 时才套:写 VARIANT
      // 属性等于换绑,而该字段默认 false、描述写明「swap 会丢失目标既有覆盖,需显式开启」
      // —— 默认路径上偷换身份就是 0007 的静默失效,故跳过并在 warnings 点名。
      if (
        snapshot.componentProperties != null &&
        Object.keys(snapshot.componentProperties).length > 0
      ) {
        const wanted: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(snapshot.componentProperties)) {
          if (!swapToSource && v.type === 'VARIANT') {
            if (!skippedIdentity.includes(k)) skippedIdentity.push(k);
            continue;
          }
          wanted[k] = v;
        }
        const { writes } = toComponentPropertyWrites(wanted);
        rejectUnsupportedAlias(ctx, aliasKeysOf(writes));
        if (Object.keys(writes).length > 0) target.setProperties(writes);
      } else if (
        snapshot.variantProperties != null &&
        Object.keys(snapshot.variantProperties).length > 0
      ) {
        if (swapToSource) {
          const variantWrites = toComponentPropertyWrites(
            snapshot.variantProperties,
          ).writes;
          rejectUnsupportedAlias(ctx, aliasKeysOf(variantWrites));
          target.setProperties(variantWrites);
        } else {
          for (const k of Object.keys(snapshot.variantProperties))
            if (!skippedIdentity.includes(k)) skippedIdentity.push(k);
        }
      }
      if (snapshot.props != null && Object.keys(snapshot.props).length > 0) {
        // 复用 updateSelection:含 TEXT 的 loadFont 等边界处理
        await updateSelection(host, ctx, {
          ids: [targetId],
          props: snapshot.props,
        });
      }
      applied.push({
        instanceId: targetId,
        instanceName: target.name,
        ok: true,
      });
    } catch (e) {
      applied.push({
        instanceId: targetId,
        instanceName: '',
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }
  const failed = applied.filter((r) => !r.ok);
  if (failed.length === applied.length && applied.length > 0) {
    throw new Error(
      `全部实例套用失败:${failed
        .map((f) => `${f.instanceId}(${f.message ?? '未知错误'})`)
        .join(', ')}`,
    );
  }
  return {
    applied,
    total: ids.length,
    source: toSummary(snapshot),
    ...(skippedIdentity.length > 0
      ? {
          warnings: [
            // i18n-exempt: 随结果上行给模型,不走面板文案
            `套用时跳过了变体属性 ${skippedIdentity.join('、')}:改变体等于给目标实例换绑(会丢它既有覆盖),只在显式 swapToSource=true 时才生效。要换变体:传 swapToSource=true,或直接用 jsd_swap_component。其余覆盖(样式/文本/布尔/换绑属性)已照常套用。`,
          ],
        }
      : {}),
  };
}

/** 无状态一次性「复制+套用」:不写缓存,适合 jsd_batch 流水 */
export async function syncInstanceOverrides(
  host: DesignHost,
  ctx: RuntimeContext,
  params: {
    sourceId: string;
    ids: string[];
    includeVisibleProps?: boolean;
    swapToSource?: boolean;
  },
): Promise<{
  applied: AppliedOverride[];
  total: number;
  source: OverrideSummary;
  warnings?: string[];
}> {
  const snapshot = await captureOverrideSnapshot(
    host,
    ctx,
    params.sourceId,
    params.includeVisibleProps !== false,
  );
  return applyOverrideSnapshot(
    host,
    ctx,
    snapshot,
    params.ids,
    params.swapToSource ?? false,
  );
}

/** 两段式第一段:复制源实例覆盖为快照,写入插件侧缓存,返回摘要 + snapshotId(=sourceId) */
export async function copyInstanceOverrides(
  host: DesignHost,
  ctx: RuntimeContext,
  params: { sourceId: string; includeVisibleProps?: boolean },
): Promise<{
  snapshotId: string;
  sourceName: string;
  captured: OverrideSummary;
}> {
  const snapshot = await captureOverrideSnapshot(
    host,
    ctx,
    params.sourceId,
    params.includeVisibleProps !== false,
  );
  cachePut(snapshot);
  return {
    snapshotId: snapshot.sourceId,
    sourceName: snapshot.sourceName,
    captured: toSummary(snapshot),
  };
}

/** 两段式第二段:按 sourceId 从缓存取快照套用到目标实例;miss 报错提示先 copy */
export async function applyCachedOverrides(
  host: DesignHost,
  ctx: RuntimeContext,
  params: { sourceId: string; ids: string[]; swapToSource?: boolean },
): Promise<{
  applied: AppliedOverride[];
  total: number;
  source: OverrideSummary;
  warnings?: string[];
}> {
  const snapshot = overrideCache.get(params.sourceId);
  if (!snapshot) {
    throw new Error(
      `缓存中没有 ${params.sourceId} 的覆盖快照,请先调用 jsd_manage_components op=copy_overrides`,
    );
  }
  return applyOverrideSnapshot(
    host,
    ctx,
    snapshot,
    params.ids,
    params.swapToSource ?? false,
  );
}
