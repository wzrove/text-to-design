import {
  type LayoutGrid,
  MIXED,
  type NodeSkeleton,
  type Paint,
  type StyleSummary,
} from 'text-to-design-shared';
import {
  type ContractPropertyValue,
  readComponentProperties,
  readComponentPropertyValues,
  readVariantProperties,
  remapPropertyIds,
  unwrapPropertyValues,
} from './property-values';
import {
  classifyInstanceProps,
  describeVariant,
  mergeVariantRequest,
  pickVariantComponent,
  type VariantComponent,
} from './variant-swap';

/**
 * MasterGo 节点门面(0017):把 `mg` 的节点形态**投影**成本仓的 `NodeSkeleton`。
 *
 * 为什么其它两个平台只要一行 `as unknown as DesignHost`,这里却要一整层:
 * MasterGo 的插件 API 与 Figma 只是「同源思路」,不是同构符号。逐项实测
 * (`@mastergo/plugin-typings@2.19.2`,证据行号见 0017):
 * - 属性名不同:`visible→isVisible`、`locked→isLocked`、`dashPattern→strokeDashes`、
 *   `cornerSmoothing→cornerSmooth`、`layoutMode→flexMode`、
 *   `primaryAxisSizingMode→mainAxisSizingMode`、`counterAxisSizingMode→crossAxisSizingMode`;
 * - 枚举值名不同:主轴对齐契约 `MIN/MAX/SPACE_BETWEEN` vs MG `FLEX_START/FLEX_END/SPACING_BETWEEN`;
 *   约束 `MIN/MAX/STRETCH` vs MG `START/END/STARTANDEND`;箭头端点 `ARROW_LINES/ARROW_EQUILATERAL`
 *   vs MG `LINE_ARROW/TRIANGLE_ARROW`;
 * - 文本属性**不在节点上**:`fontSize/fontName/lineHeight/letterSpacing/textCase/
 *   textDecoration/textStyleId` 在 MG 只有分段 `textStyles[]` + `setRangeXxx(start,end,…)`;
 * - 混合哨兵不同:`mg.mixed` 是 `string | symbol`,契约的 `MIXED = 'figma.mixed'` 直接
 *   比较可能恒 false;
 * - 图片 paint 字段不同:MG 用 `imageRef`,契约线格式用 `imageHash`;
 * - 节点类型名不同:MG 的矢量是 `PEN`(契约是 `VECTOR`)。
 *
 * 只做**投影**,不做策略:core 的调用顺序、事务边界、告警口径一律不动。读写都收敛在
 * 这里,core 与线格式保持平台无关(0010/0011 的边界纪律)。
 *
 * ⚠ 本层**尚未在 MasterGo 客户端上联调**(本仓没有该平台的运行环境),每条映射的
 * 依据都是 typings 声明而非实测回读。首次联调要点见 `docs/design-decisions/0017`。
 */

/** 契约字段名 → MasterGo 字段名(读写共用一张表,反向由 invert 派生,不手写第二份) */
export const KEY_TO_MG = {
  visible: 'isVisible',
  locked: 'isLocked',
  dashPattern: 'strokeDashes',
  cornerSmoothing: 'cornerSmooth',
  layoutMode: 'flexMode',
  primaryAxisSizingMode: 'mainAxisSizingMode',
  counterAxisSizingMode: 'crossAxisSizingMode',
  layoutGrow: 'flexGrow',
  layoutAlign: 'alignSelf',
  primaryAxisAlignItems: 'mainAxisAlignItems',
  counterAxisAlignItems: 'crossAxisAlignItems',
} as const satisfies Record<string, string>;

/** 契约值 → MasterGo 值(读路径用同一张表取反) */
export const VALUE_TO_MG = {
  primaryAxisAlignItems: {
    MIN: 'FLEX_START',
    MAX: 'FLEX_END',
    CENTER: 'CENTER',
    SPACE_BETWEEN: 'SPACING_BETWEEN',
  },
  counterAxisAlignItems: {
    MIN: 'FLEX_START',
    MAX: 'FLEX_END',
    CENTER: 'CENTER',
  },
  strokeCap: {
    NONE: 'NONE',
    ROUND: 'ROUND',
    SQUARE: 'SQUARE',
    ARROW_LINES: 'LINE_ARROW',
    ARROW_EQUILATERAL: 'TRIANGLE_ARROW',
  },
  constraints: {
    MIN: 'START',
    MAX: 'END',
    STRETCH: 'STARTANDEND',
    CENTER: 'CENTER',
    SCALE: 'SCALE',
  },
} as const satisfies Record<string, Record<string, string>>;

/**
 * 网格对齐:契约 MIN/MAX ↔ MG LEFT/RIGHT。
 *
 * 写成 `as const satisfies` 而不是 `Record<string, string>`:sync-guarantee 要用
 * `typeof` 取出**字面量**取值域做编译期断言(宽类型下 `keyof` 退化成 `string`,
 * 断言恒真——那正是"看起来在守、其实没守")。运行期按下标查的那两处走下面的宽别名。
 */
export const GRID_ALIGN_TO_MG = {
  MIN: 'LEFT',
  MAX: 'RIGHT',
  CENTER: 'CENTER',
  STRETCH: 'STRETCH',
} as const satisfies Record<string, string>;

/** 运行期按下标查用(键是运行时的字符串,字面量对象不能直接索引) */
const GRID_ALIGN_BY_KEY: Record<string, string> = GRID_ALIGN_TO_MG;

/** 键是平台类型名,值是本仓类型名;`satisfies` 保字面量键,断言才查得到 'PEN' */
export const MG_TYPE_TO_CONTRACT = { PEN: 'VECTOR' } as const satisfies Record<
  string,
  string
>;

/**
 * 文本属性 → MasterGo 的分段 setter。
 *
 * 这批字段在 MG 的 `TextNode` 上**没有实例属性**(typings 里 `TextNode` 只有
 * `characters` / `textAlignHorizontal` / `textAlignVertical` / `textAutoResize` /
 * `paragraphSpacing` / `textStyles`),整段写入只能经
 * `setRangeXxx(0, characters.length, …)`。契约保持 Figma 形态的节点属性,差异在本表收口。
 */
export const TEXT_RANGE_SETTERS = {
  fontSize: 'setRangeFontSize',
  fontName: 'setRangeFontName',
  lineHeight: 'setRangeLineHeight',
  letterSpacing: 'setRangeLetterSpacing',
  textCase: 'setRangeTextCase',
  textDecoration: 'setRangeTextDecoration',
  textStyleId: 'setRangeTextStyleId',
} as const satisfies Record<string, string>;

const TEXT_RANGE_PROPS = Object.keys(TEXT_RANGE_SETTERS);

type RawNode = Record<string, unknown> & {
  id?: string;
  type?: string;
  textStyles?: readonly Record<string, unknown>[];
  characters?: string;
};

/** 门面 → 原始节点(把参数翻回宿主对象时用) */
const RAW_OF_FACADE = new WeakMap<object, RawNode>();
/** 原始节点 → 门面:同一宿主节点必须拿回**同一个**门面对象(identity 稳定) */
const FACADE_OF_RAW = new WeakMap<object, NodeSkeleton>();

/** 把一个可能来自其它平台/已是裸对象的值翻回宿主节点 */
export function unwrapNode<T>(value: T): T | RawNode {
  if (value != null && typeof value === 'object') {
    const raw = RAW_OF_FACADE.get(value as object);
    if (raw != null) return raw;
  }
  return value;
}

function invert(map: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k]));
}

const VALUE_TO_CONTRACT: Record<
  string,
  Record<string, string>
> = Object.fromEntries(
  Object.entries(VALUE_TO_MG).map(([key, map]) => [key, invert(map)]),
);

/** 表驱动取值:键是运行时的字符串,故显式收窄成可索引的字典(而不是让 TS 猜) */
const VALUE_MAP_BY_KEY: Record<string, Record<string, string>> = VALUE_TO_MG;
const VALUE_CONTRACT_BY_KEY: Record<
  string,
  Record<string, string>
> = VALUE_TO_CONTRACT;

/** 宿主混合哨兵:MG 是 `string | symbol`,契约是字符串哨兵 —— 统一翻成契约值 */
function normalizeMixed(value: unknown): unknown {
  return value === mg.mixed ? MIXED : value;
}

/**
 * 读取文本属性:整段一致 → 该值;分段不一致 → 契约的混合哨兵。
 *
 * 两处形状差异(实测 `@mastergo/plugin-typings@2.19.2`):
 * ① `TextNode.textStyles` 是**分段样式表**,`[0]` 即首段;没设过样式的节点是空数组
 *    (读不到不等于没字体 —— 见 platform-limits 的 unloaded font 那条);
 * ② 字号/字体/行高/字距/大小写/装饰都在段的**嵌套**对象里(`seg.textStyle.fontSize`),
 *    只有 `textStyleId` 在段的顶层。按顶层读会永远 undefined(实测踩过:创建时写了
 *    fontSize,回读却没有该字段)。
 */
function readTextProp(raw: RawNode, prop: string): unknown {
  const segments = raw.textStyles;
  if (segments == null || segments.length === 0) return undefined;
  const at = (seg: Record<string, unknown>) => {
    if (prop === 'textStyleId') return seg.textStyleId;
    const nested = seg.textStyle as Record<string, unknown> | undefined;
    return nested?.[prop];
  };
  const values = segments.map((seg) => normalizeMixed(at(seg)));
  const first = values[0];
  for (const value of values) {
    if (value !== first) return MIXED;
  }
  return first;
}

/** paint 读:MG 的 `imageRef` / `isVisible` 翻回契约的 `imageHash` / `visible` */
function readPaints(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((paint) => readPaint(paint));
}

function readPaint(paint: unknown): unknown {
  if (paint == null || typeof paint !== 'object') return paint;
  const src = paint as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(src)) {
    if (key === 'imageRef') out.imageHash = value;
    else if (key === 'isVisible') out.visible = value;
    else if (key === 'color') out.color = readColor(value);
    else if (key === 'transform') out.gradientTransform = value;
    else out[key] = value;
  }
  return out;
}

/**
 * 纯色透明度:MG 把它放在 `color.a`(且注明 SOLID 的 `alpha` 恒为 1),而本仓线格式
 * 折在 paint 级 `opacity`(`schemas/base.ts` 的说明)。读:带回 `a`;写:折进 `a`。
 */
function readColor(value: unknown): unknown {
  if (value == null || typeof value !== 'object') return value;
  const c = value as Record<string, unknown>;
  const a = c.a;
  if (typeof a !== 'number' || a >= 1) return { r: c.r, g: c.g, b: c.b };
  return { r: c.r, g: c.g, b: c.b, a };
}

/** paint 写:契约的 `imageHash` / `visible` 翻成 MG 的 `imageRef` / `isVisible` */
function writePaints(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((paint) => {
    if (paint == null || typeof paint !== 'object') return paint;
    const src = paint as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(src)) {
      if (key === 'imageHash') out.imageRef = val;
      else if (key === 'visible') out.isVisible = val;
      // MG 的纯色 paint 没有 paint 级 opacity:透明度必须写进 color.a,
      // 而 MG 的 RGBA 要求 a 存在 —— 缺 a 的 paint 会被引擎**静默丢弃**
      // (实测:写 fills 回包「已更新」,回读仍是默认灰)
      else if (key === 'opacity') out.__opacity = val;
      else out[key] = val;
    }
    if (out.type === 'SOLID') out.color = writeColor(out.color, out.__opacity);
    delete out.__opacity;
    if (GRADIENT_TYPES.has(out.type as string)) {
      // MG 的渐变字段叫 `transform`(本仓线格式是 `gradientTransform`),
      // 名字不对 → 缺必填字段 → 整条 paint 被静默丢弃(实测:回读成默认灰)
      if (out.gradientTransform !== undefined && out.transform === undefined) {
        out.transform = out.gradientTransform;
      }
      delete out.gradientTransform;
      // 停靠点颜色是 MG 的 RGBA:必须有 a
      if (Array.isArray(out.gradientStops)) {
        out.gradientStops = out.gradientStops.map((stop) => {
          if (stop == null || typeof stop !== 'object') return stop;
          const st = stop as Record<string, unknown>;
          return {
            position: st.position,
            color: writeColor(st.color, undefined),
          };
        });
      }
    }
    return out;
  });
}

/** MG 的渐变类型(含它自己的 GRADIENT_DIAMOND) */
const GRADIENT_TYPES = new Set([
  'GRADIENT_LINEAR',
  'GRADIENT_RADIAL',
  'GRADIENT_ANGULAR',
  'GRADIENT_DIAMOND',
]);

/**
 * 读效果:MG 的 `isVisible` 翻回契约的 `visible`;丢掉 MG 专有字段。
 * MG 的 `ShadowEffect` 还带 `isEffectShow`,契约没有对应物,不透传(免得污染线格式)。
 */
function readEffects(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((effect) => {
    if (effect == null || typeof effect !== 'object') return effect;
    const src = effect as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(src)) {
      if (key === 'isVisible') out.visible = val;
      else if (key === 'isEffectShow') continue;
      else out[key] = val;
    }
    return out;
  });
}

/**
 * MasterGo 的 Effect **必填**字段默认值。
 *
 * MG 把一批字段声明为必填且名字与契约不同(逐项实测 `@mastergo/plugin-typings@2.19.2`):
 * - 可见性叫 `isVisible`(契约叫 `visible`);
 * - 阴影必填 `spread` / `blendMode` / `showShadowBehindNode`;
 * - 模糊(LAYER_BLUR / BACKGROUND_BLUR)必填 `blendMode` 与 `gradient`(MG 的渐进模糊模型)。
 * 缺任一项都可能整条 effect 被丢弃(实测阴影没落),故按 MG 的模型补齐。
 *
 * **导出**的目的只有一个:让 `sync-guarantee.ts` 做编译期断言 —— 这些键必须真的在
 * MG 的 `ShadowEffect` / `BlurEffect` 上且类型一致。官方改了必填集合会 `tsc` 失败,
 * 而不是等到真机上「阴影又不落」才发现(此前这份默认值是内联字面量,没有任何守卫)。
 */
export const MG_SHADOW_DEFAULTS = {
  isVisible: true,
  blendMode: 'NORMAL',
  spread: 0,
  showShadowBehindNode: false,
} as const;

/** 模糊的必填默认值(不含 `gradient`,那项是独立对象,见 {@link MG_BLUR_GRADIENT}) */
export const MG_BLUR_DEFAULTS = {
  isVisible: true,
  blendMode: 'NORMAL',
} as const;

/** MG 模糊必填的渐进模糊参数:偶数模糊(无渐进) */
export const MG_BLUR_GRADIENT = { mode: 'EVEN' } as const;

/**
 * 写效果:按上面的默认值表补齐 MG 的必填字段。
 */
function writeEffects(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((effect) => {
    if (effect == null || typeof effect !== 'object') return effect;
    const src = effect as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(src)) {
      if (key === 'visible') out.isVisible = val;
      else if (key === 'isEffectShow') continue;
      else out[key] = val;
    }
    const DEFAULTS = {
      ...MG_SHADOW_DEFAULTS,
      ...MG_BLUR_DEFAULTS,
    } as Record<string, unknown>;
    for (const [key, val] of Object.entries(DEFAULTS)) {
      if (out[key] === undefined) out[key] = val;
    }
    if (out.type === 'LAYER_BLUR' || out.type === 'BACKGROUND_BLUR') {
      if (out.gradient === undefined) out.gradient = MG_BLUR_GRADIENT;
      // 模糊没有 spread / showShadowBehindNode:上表把阴影专有的两项也带进来了,
      // 这里剔掉,免得给引擎塞它不认识的字段(MG 的联合是判别式的)
      delete out.spread;
      delete out.showShadowBehindNode;
    }
    return out;
  });
}

/** 写:把 paint 级 opacity 折成 color.a;缺 a 时补 1(否则 MG 丢弃整条 paint) */
function writeColor(value: unknown, opacity: unknown): unknown {
  const src = (value ?? {}) as Record<string, unknown>;
  const fromOpacity = typeof opacity === 'number' ? opacity : undefined;
  const a = fromOpacity ?? (typeof src.a === 'number' ? (src.a as number) : 1);
  return { r: src.r, g: src.g, b: src.b, a };
}

/** 布局网格读:MG `gridType`/`LEFT|RIGHT` + `isVisible` 翻回契约 `pattern`/`MIN|MAX`/`visible` */
function readLayoutGrids(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((grid) => {
    if (grid == null || typeof grid !== 'object') return grid;
    const src = grid as Record<string, unknown>;
    const out: Record<string, unknown> = { pattern: src.gridType };
    for (const [key, val] of Object.entries(src)) {
      if (key === 'gridType') continue;
      if (key === 'isVisible') out.visible = val;
      else if (key === 'alignment')
        out.alignment = invert(GRID_ALIGN_BY_KEY)[val as string] ?? val;
      else out[key] = val;
    }
    return out;
  });
}

/** 布局网格写:GRID 在 MG 只有 sectionSize(其余键无处安放,点名而不是丢掉不说) */
function writeLayoutGrids(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((grid) => {
    if (grid == null || typeof grid !== 'object') return grid;
    const src = grid as unknown as LayoutGrid;
    const out: Record<string, unknown> = { gridType: src.pattern };
    if (src.sectionSize != null) out.sectionSize = src.sectionSize;
    if (src.count != null) out.count = src.count;
    if (src.gutterSize != null) out.gutterSize = src.gutterSize;
    if (src.offset != null) out.offset = src.offset;
    if (src.visible != null) out.isVisible = src.visible;
    // 网格颜色同样是 MG 的 RGBA(a 必填)—— 与 paint 走同一个换算,别只给某一个
    // 落点补 alpha:此前 paint 补了、这里漏了,就是「同一个类型事实按字段名逐点补」
    // 的典型漏法(见 0022)。
    if (src.color != null) out.color = writeColor(src.color, undefined);
    if (src.alignment != null) {
      out.alignment = GRID_ALIGN_BY_KEY[src.alignment] ?? src.alignment;
    }
    return out;
  });
}

/** 读路径:把宿主值翻成契约值(键名已由调用方映射) */
function readValue(raw: RawNode, key: string, value: unknown): unknown {
  // 数组形状的两项按 typings 投影成契约的 Record(键取 `id ?? name`):
  // MG 的 `variantProperties`(3092 行)/ `componentProperties`(3096 行)都是数组,
  // 契约是 Record。投影函数在 property-values.ts(纯函数、有单测)。
  if (key === 'variantProperties') return readVariantProperties(value);
  if (key === 'componentProperties') {
    // 实例侧是 `componentProperties`,组件侧是 `componentPropertyValues`(两个字段名不同,
    // 见 property-values.ts 的说明)—— 后者是调用方发现「这个组件有哪些可写属性」的唯一入口
    return (
      readComponentProperties(value) ??
      readComponentPropertyValues(raw.componentPropertyValues)
    );
  }
  if (key === 'parent')
    return value == null ? null : wrapNode(value as RawNode);
  if (key === 'children' || key === 'selection') {
    return Array.isArray(value)
      ? value.map((n) => wrapNode(n as RawNode))
      : value;
  }
  if (key === 'type') {
    const map: Record<string, string> = MG_TYPE_TO_CONTRACT;
    return map[value as string] ?? value;
  }
  if (key === 'mainComponent') {
    if (value != null) return wrapNode(value as RawNode);
    // MG 运行时给的是 **`mainComponentId`(字符串)**,`mainComponent` 读不到
    // (实测:实例键里有 mainComponentId=20:263,而 mainComponent 是 undefined;
    // typings 两个都写了,只有前者运行时真有)。没有它,core 的实例主件读取
    // (样式提示、swap 校验、override 同步)在 MG 上全部落空。
    const mainId = raw.mainComponentId;
    if (typeof mainId === 'string' && mainId !== '') {
      const node = mg.getNodeById(mainId);
      return node == null ? null : wrapNode(node);
    }
    return null;
  }
  if (key === 'fills' || key === 'strokes') return readPaints(value);
  if (key === 'effects') return readEffects(value);
  if (key === 'layoutGrids') return readLayoutGrids(value);
  if (key === 'constraints' && value != null) {
    const c = value as { horizontal: string; vertical: string };
    const map = VALUE_TO_CONTRACT.constraints;
    return {
      horizontal: map[c.horizontal] ?? c.horizontal,
      vertical: map[c.vertical] ?? c.vertical,
    };
  }
  if (
    key === 'strokeCap' ||
    key === 'primaryAxisAlignItems' ||
    key === 'counterAxisAlignItems'
  ) {
    const map = VALUE_CONTRACT_BY_KEY[key];
    return map?.[value as string] ?? value;
  }
  if (Object.prototype.hasOwnProperty.call(TEXT_RANGE_SETTERS, key)) {
    return readTextProp(raw, key);
  }
  return normalizeMixed(value);
}

/** 写路径:把契约值翻成宿主值(键名已由调用方映射) */
function writeValue(raw: RawNode, key: string, value: unknown): boolean {
  if (Object.prototype.hasOwnProperty.call(TEXT_RANGE_SETTERS, key)) {
    if (value === MIXED) return true;
    const setter =
      raw[TEXT_RANGE_SETTERS[key as keyof typeof TEXT_RANGE_SETTERS]];
    if (typeof setter !== 'function') return true;
    const length = (raw.characters ?? '').length;
    (setter as (s: number, e: number, v: unknown) => void).call(
      raw,
      0,
      length,
      value,
    );
    return true;
  }
  if (key === 'fills' || key === 'strokes') {
    return Reflect.set(raw, key, writePaints(value), raw);
  }
  if (key === 'effects') {
    return Reflect.set(raw, key, writeEffects(value), raw);
  }
  if (key === 'layoutGrids') {
    return Reflect.set(raw, key, writeLayoutGrids(value), raw);
  }
  if (key === 'constraints' && value != null) {
    const c = value as { horizontal: string; vertical: string };
    const map = VALUE_TO_MG.constraints;
    return Reflect.set(
      raw,
      key,
      {
        horizontal: map[c.horizontal as keyof typeof map] ?? c.horizontal,
        vertical: map[c.vertical as keyof typeof map] ?? c.vertical,
      },
      raw,
    );
  }
  if (
    key === 'strokeCap' ||
    key === 'primaryAxisAlignItems' ||
    key === 'counterAxisAlignItems'
  ) {
    const map = VALUE_MAP_BY_KEY[key];
    return Reflect.set(raw, key, map?.[value as string] ?? value, raw);
  }
  // `layoutAlign` 的值域收窄(alignSelf 只有 STRETCH/INHERIT)**不在这里判**:
  // 判定归位到 core 写路径(`core/props/platform-gate.ts`,按 shared 的
  // dicts/platform-value-domain.ts 判),被拒时进结果 warnings —— 门面里那份
  // console.warn 版本对调用方不可见,正是 0007 要根除的静默失效(见 0022)。
  return Reflect.set(raw, key, value, raw);
}

/**
 * 实例属性写入(`setProperties` 的门面实现)。
 *
 * 变体值:MG 的两条原生入口(`setProperties` / `setVariantPropertyValues`)运行时**静默无效**
 * (真机实测;且 `componentProperties[].id` 运行时不存在,按 propertyId 写也无从下手),
 * 唯一有效路径是**换成同一 COMPONENT_SET 里目标值的那个成分** —— 换完 `variantProperties`
 * 即为目标值。匹配不到就明确报错并列出可用组合,绝不静默放行(那正是原生入口的坑)。
 *
 * 其余属性(布尔/文本/换绑组件属性):仍走宿主 `setProperties`,键先按 propertyId 归一。
 *
 * 回读校验:换绑后再读一次 `variantProperties`,与期望值比对 —— 宿主行为变了会当场暴露,
 * 而不是变成「回包成功、画布没变」。
 */
function applyInstanceProps(target: RawNode, props: unknown): void {
  const unwrapped = unwrapPropertyValues(props);
  if (unwrapped == null || typeof unwrapped !== 'object') return;
  const current = readVariantProperties(target.variantProperties) ?? {};
  // 可写属性表 = 实例侧(`componentProperties`)+ **主组件侧**(`componentPropertyValues`)。
  // 后者是权威清单:实例侧只列当前已有值的项,主组件侧列「这个组件定义了哪些属性」。
  const main = mainComponentOf(target);
  const instTable = readComponentProperties(target.componentProperties);
  const mainTable = readComponentPropertyValues(main?.componentPropertyValues);
  const tableReadable = instTable !== undefined || mainTable !== undefined;
  const declared: Record<string, ContractPropertyValue> = {
    ...(mainTable ?? {}),
    ...(instTable ?? {}),
  };
  const types: Record<string, string> = {};
  for (const [key, entry] of Object.entries(declared)) types[key] = entry.type;
  const variantKeys = [
    ...Object.keys(current),
    ...Object.keys(declared).filter((k) => declared[k].type === 'VARIANT'),
  ];
  const { variant, rest, wrongType, unknown } = classifyInstanceProps(
    unwrapped as Record<string, unknown>,
    { variantKeys, types },
  );
  if (wrongType.length > 0) {
    // i18n-exempt: 随错误包上行给模型,不走面板文案
    throw new Error(
      `变体属性 ${wrongType.join('、')} 的值必须是字符串(当前值类型不对),未向宿主发起请求。`,
    );
  }
  if (unknown.length > 0 && tableReadable) {
    const known = Object.keys(declared);
    // i18n-exempt: 同上
    throw new Error(
      `属性 ${unknown.join('、')} 不在该实例的可写属性里。变体属性:${variantKeys.join('、') || '(无)'};组件属性:${known.join('、') || '(无)'}。属性名要用 jsd_find 回读的 variantProperties / componentProperties 里的键原样;该组件还没有这个属性时,先用 mg_add_component_property 建(见 0019)。`,
    );
  }

  if (Object.keys(variant).length > 0) {
    const desired = mergeVariantRequest(current, variant);
    const candidates = variantCandidates(target);
    if (candidates == null) {
      // i18n-exempt: 随错误包上行给模型,不走面板文案
      throw new Error(
        `无法切变体:当前实例不在变体集(COMPONENT_SET)里,或用例成分读不到变体值。请求:${describeVariant(desired)}。`,
      );
    }
    const { matched, available } = pickVariantComponent(desired, candidates);
    if (matched == null) {
      // i18n-exempt: 同上
      throw new Error(
        `无法切变体:集合里没有变体值匹配 ${describeVariant(desired)} 的成分。可用组合:${available.join(' | ') || '(读不到变体值)'}。可先用 jsd_find 看 variantProperties 的全部取值。`,
      );
    }
    swapComponent(target, matched);
    const after = readVariantProperties(target.variantProperties) ?? {};
    if (Object.keys(desired).some((k) => after[k] !== desired[k])) {
      // i18n-exempt: 同上
      throw new Error(
        `切变体后回读不一致:期望 ${describeVariant(desired)},实际 ${describeVariant(after)}。宿主行为可能已变,请重新核对(见 0018)。`,
      );
    }
  }

  if (unknown.length > 0) {
    // 属性表读不到(既没有实例侧也没有主组件侧的表)→ 无从判定名字对不对,
    // 转发给宿主并留一条开发者日志(插件 console),而不是静默丢掉
    for (const key of unknown)
      rest[key] = (unwrapped as Record<string, unknown>)[key];
    console.warn(
      // i18n-exempt: 开发者日志(插件 console)
      `[mastergo] 读不到实例属性表,属性 ${unknown.join('、')} 将原样转发给宿主(可能被静默忽略)`,
    );
  }

  if (Object.keys(rest).length > 0) {
    const fn = target.setProperties;
    if (typeof fn !== 'function') {
      // i18n-exempt: 同上
      throw new Error('宿主没有 setProperties,无法写入组件属性。');
    }
    // 键归一到 propertyId(typings 的 `setProperties({[propertyId]: …})`)。
    // 两张表都喂进去:主组件侧的 `componentPropertyValues` 才是带 `id` 的权威清单,
    // 而 MG 的**实例侧 `componentProperties` 实测经常是空表** —— 只看实例侧等于不归一,
    // 键以属性名落到宿主(名字对 BOOLEAN/TEXT 能兜住,对 INSTANCE_SWAP 这类就走不通)。
    fn.call(
      target,
      remapPropertyIds(
        rest,
        main?.componentPropertyValues,
        target.componentProperties,
      ),
    );
    // 回读校验:本平台有「回包成功、值没变」的前科(VARIANT 那两条入口)。
    // 只在**读得到属性表**时才判定(读不到就无从判断,不能凭空报错)。
    // **不做实例侧回读判定**:MG 的实例 `componentProperties` 不可靠 —— 实测同一实例
    // 写前能报出该属性、写后却回空表(而绑定的图层确实变了),拿它判「写失败」就是假阴性。
    // 想在 MG 上确认实例属性生效,判据是**读绑定图层**:`mg_list_sublayers` 回读
    // `characters` / `isVisible`(见 0019 的复验节)。这里只在明显不一致时留开发者日志。
    const after = readComponentProperties(target.componentProperties);
    if (after != null) {
      const missed = Object.keys(rest).filter(
        (k) => after[k] == null && instTable?.[k] != null,
      );
      if (missed.length > 0) {
        console.warn(
          // i18n-exempt: 开发者日志(插件 console)
          `[mastergo] 属性 ${missed.join('、')} 写后实例侧表读不到(该表在 MG 上不稳定);要确认生效请读绑定图层:mg_list_sublayers`,
        );
      }
    }
  }
}

/**
 * 解析实例的主组件(宿主对象)。
 *
 * 优先运行时的 `mainComponentId`(typings 声明的 `mainComponent` 运行时读不到,见 0017),
 * 拿不到再退回 `mainComponent`。属性表(组件侧 `componentPropertyValues`)与变体集成分都从这里出发。
 */
function mainComponentOf(target: RawNode): RawNode | null {
  const mainId = target.mainComponentId;
  if (typeof mainId === 'string' && mainId !== '') {
    const node = mg.getNodeById(mainId);
    if (node != null) return node as unknown as RawNode;
  }
  const direct = target.mainComponent;
  return direct != null && typeof direct === 'object'
    ? (direct as RawNode)
    : null;
}

/** 换绑到目标成分:优先 `swapComponent`,回退 `setVariantPropertyValues`(老版本宿主可能存在) */
function swapComponent(target: RawNode, matched: VariantComponent): void {
  const node = mg.getNodeById(matched.id);
  if (node == null) {
    // i18n-exempt: 同上
    throw new Error(`目标成分 ${matched.id} 已不在文档里(换变体失败)。`);
  }
  const swap = target.swapComponent;
  if (typeof swap === 'function') {
    swap.call(target, node);
    return;
  }
  const setVariant = target.setVariantPropertyValues;
  if (typeof setVariant === 'function') {
    setVariant.call(target, matched.variantProperties ?? {});
    return;
  }
  // i18n-exempt: 同上
  throw new Error(
    '宿主既没有 swapComponent 也没有 setVariantPropertyValues,无法切变体。',
  );
}

/**
 * 实例所在变体集的成分清单(带变体值);不是变体集内实例、或读不到集合时返回 null。
 * 主组件 id 取运行时的 `mainComponentId`(typings 声明的 `mainComponent` 运行时读不到,见 0017)。
 */
function variantCandidates(target: RawNode): VariantComponent[] | null {
  const set = mainComponentOf(target)?.parent as RawNode | undefined;
  if (set == null || !Array.isArray((set as { children?: unknown }).children)) {
    return null;
  }
  const children = (set as { children: RawNode[] }).children;
  return children.flatMap((c) =>
    c != null && typeof c.id === 'string'
      ? [
          {
            id: c.id,
            variantProperties: readVariantProperties(c.variantProperties),
          },
        ]
      : [],
  );
}

/** 宿主节点原型上的方法返回的门面化:节点 / 节点数组 / 其它值 */
function wrapResult(result: unknown): unknown {
  if (Array.isArray(result)) return result.map((n) => wrapNode(n as RawNode));
  if (
    result != null &&
    typeof result === 'object' &&
    typeof (result as RawNode).id === 'string' &&
    typeof (result as RawNode).type === 'string'
  ) {
    return wrapNode(result as RawNode);
  }
  return result;
}

/**
 * 方法调用:参数里的门面翻回宿主节点、函数参数包一层(回调拿到的是门面)、
 * `this` 绑回宿主节点(宿主方法不认门面)。
 */
function callMethod(
  raw: RawNode,
  fn: (...args: unknown[]) => unknown,
  args: unknown[],
): unknown {
  const mapped = args.map((arg) => {
    if (typeof arg === 'function') {
      return (...inner: unknown[]) =>
        (arg as (...a: unknown[]) => unknown)(
          ...inner.map((v) => wrapResult(v)),
        );
    }
    return unwrapNode(arg);
  });
  return wrapResult(fn.apply(raw, mapped));
}

/**
 * 把宿主节点包成契约节点。
 *
 * 用 Proxy 而不是「原型委派对象」:委派对象对**读**够用,但写入会落成门面自己的属性
 * (`node.fills = …` 变成给门面挂字段,宿主一无所知) —— 那正是最难查的一类静默失效。
 * 只拦截差异键,其余键 `Reflect.get/set(target, key, target)` 直通宿主,`this` 始终是宿主对象。
 */
export function wrapNode(raw: object): NodeSkeleton {
  const target = raw as RawNode;
  const cached = FACADE_OF_RAW.get(raw);
  if (cached != null) return cached;
  const facade = new Proxy(target, {
    get(target, key, receiver) {
      if (typeof key === 'symbol') return Reflect.get(target, key, receiver);
      const mgKey = KEY_TO_MG[key as keyof typeof KEY_TO_MG] ?? key;
      const value = Reflect.get(target, mgKey, target);
      if (typeof value === 'function') {
        // 实例属性:不能在门面里「整形参数后转发」—— 本平台对变体值的两条原生入口
        // (`setProperties` / `setVariantPropertyValues`)运行时都**静默无效**,
        // 唯一有效路径是集合内换绑,那需要多步宿主调用 + 回读校验(见 applyInstanceProps)。
        if (key === 'setProperties') {
          return (props: unknown) => applyInstanceProps(target, props);
        }
        return (...args: unknown[]) =>
          callMethod(target, value as (...a: unknown[]) => unknown, args);
      }
      return readValue(target, key, value);
    },
    set(target, key, value) {
      if (typeof key === 'symbol')
        return Reflect.set(target, key, value, target);
      const mgKey = KEY_TO_MG[key as keyof typeof KEY_TO_MG] ?? key;
      return writeValue(target, mgKey, value);
    },
    has(target, key) {
      if (typeof key === 'symbol') return Reflect.has(target, key);
      // `componentProperties` 有**两条宿主来源**(实例侧 `componentProperties` /
      // 组件侧 `componentPropertyValues`,见 0017 复核节),只看契约名会让组件侧整字段被跳过。
      if (key === 'componentProperties') {
        return (
          Reflect.has(target, 'componentProperties') ||
          Reflect.has(target, 'componentPropertyValues')
        );
      }
      const mgKey = KEY_TO_MG[key as keyof typeof KEY_TO_MG] ?? key;
      if (Reflect.has(target, mgKey)) return true;
      // 兜底:MG 的宿主节点是**代理对象**,它的 `has` 未必可靠(契约名与宿主名不同的字段最容易
      // 中招,上面 `componentProperties` 就是实例)。故 `has` 退化为「读得到就算存在」;
      // 读抛异常的键(平台禁止同步访问的 getter)按不存在算。
      //
      // 注意别拿它解释「读不到组件内部子层」:那条查过了(**普通 frame 的 children 读得到**,
      // 组件/实例的读不到,连 MG 自己的 `page.findAll()` 也不含 symbol 内部图层)——
      // 是平台不透出 symbol 内部结构,不是 `has` 的锅。见 0019 的复验节。
      try {
        return Reflect.get(target, mgKey, target) !== undefined;
      } catch {
        return false;
      }
    },
  }) as unknown as NodeSkeleton;
  RAW_OF_FACADE.set(facade as object, target);
  FACADE_OF_RAW.set(target, facade);
  return facade;
}

/** 平台样式对象 → 契约的样式摘要(只取 id/name/type,与另两平台同构) */
export function summarizeStyle(style: {
  id: string;
  name: string;
  type: string;
}): StyleSummary {
  return { id: style.id, name: style.name, type: style.type };
}

/** 契约 Paint 类型别名,供 host.ts 与门面共用(避免两侧各写一份断言) */
export type FacadePaint = Paint;

/** 文本类字段名清单,供 sync-guarantee 核对「契约有 / MG 节点上没有」 */
export const TEXT_RANGE_PROP_NAMES: readonly string[] = TEXT_RANGE_PROPS;
