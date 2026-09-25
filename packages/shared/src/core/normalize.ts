import {
  BOOLEAN_OPERATIONS,
  type BooleanOperation,
} from '../dicts/boolean-operation';
import type { Effect, LayoutGrid, Paint, VectorPath } from '../schemas';
import { parseHexColor } from '../schemas';

/**
 * 引擎赋值前的归一化(平台无关,防御纵深):
 * zod 边界校验拦截不到的载荷(嵌套 children、jsd_batch 直调、旧客户端等)走到这里,
 * 把常见的「引擎会拒收」的形状修好,修不了就抛带路径的中文错误,避免引擎抛出
 * "in set_fills / in set_effects" 这类难懂错误。
 */

function normChannel(v: unknown, path: string, key: string): number {
  if (typeof v !== 'number' || Number.isNaN(v)) {
    throw new Error(`${path}.${key} 必须是数字,收到 ${typeof v}`);
  }
  return v;
}

interface NormalizedColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}

/** 颜色通道归一化:hex 字符串与 0-255 → 0-1(任一路 >1 视为 0-255 输入,整组 /255);0-1 原样保留 */
function normalizeColor(raw: unknown, path: string): NormalizedColor {
  if (typeof raw === 'string') {
    const hex = parseHexColor(raw);
    if (hex == null) {
      throw new Error(
        `${path} 颜色字符串无效: ${raw}(支持 #RGB/#RGBA/#RRGGBB/#RRGGBBAA 或 {r,g,b[,a]} 对象)`,
      );
    }
    return hex;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`${path} 必须是颜色对象 {r,g,b[,a]} 或 hex 字符串`);
  }
  const o = raw as Record<string, unknown>;
  let r = normChannel(o.r, path, 'r');
  let g = normChannel(o.g, path, 'g');
  let b = normChannel(o.b, path, 'b');
  let a = o.a != null ? normChannel(o.a, path, 'a') : undefined;
  if (r > 1 || g > 1 || b > 1 || (a != null && a > 1)) {
    r /= 255;
    g /= 255;
    b /= 255;
    if (a != null) a /= 255;
  }
  return { r, g, b, a };
}

/**
 * 图片填充缺省缩放方式。
 *
 * 三平台 typings 都把它列为 `ImagePaint` 的必填(Figma/jsDesign 无 `?`),
 * 而线格式允许缺省 —— 缺省时引擎可能判整条 paint 非法并静默丢弃(回读成默认灰)。
 * 默认取 `FILL`(与平台 UI 的默认缩放一致):裁满容器。
 */
const DEFAULT_IMAGE_SCALE_MODE = 'FILL';

/**
 * 给颜色补上 `a`(缺省 1)。
 *
 * 为什么统一在这里补而不是逐个平台补:三平台 typings 里**凡声明为 RGBA 的位置**
 * `a` 都是必填(渐变停靠点 / 阴影 / 网格颜色),而线格式允许只给 rgb。此前这条
 * 约束按字段名在各处补(MasterGo 门面的 paint 落点补了、effect 与 grid 落点漏了),
 * 补到第二处就开始漏 —— 收成一个函数,新增 RGBA 落点直接复用(见决策 0022)。
 */
function withAlpha(c: NormalizedColor): NormalizedColor {
  return { r: c.r, g: c.g, b: c.b, a: c.a ?? 1 };
}

/**
 * 布局网格归一化:color 的 hex 字符串转通道对象(引擎只收 {r,g,b[,a]});
 * ROWS/COLUMNS 的必填字段补齐/校验(见函数内注释)。
 */
export function normalizeLayoutGrids(value: unknown): LayoutGrid[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `layoutGrids 必须是数组,收到 ${value === null ? 'null' : Array.isArray(value) ? '数组' : typeof value}`,
    );
  }
  return value.map((raw, i) => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
      throw new Error(`layoutGrids[${i}] 必须是布局网格对象`);
    }
    const g = raw as Record<string, unknown>;
    const out: Record<string, unknown> = {
      ...g,
      // 网格颜色在三平台 typings 里都是 RGBA(`a` 必填),而 hex/对象入参可能只给
      // rgb —— 缺 a 时补 1(与 effects 的颜色同口径),否则 MasterGo 会整条 paint 丢弃。
      ...(g.color != null
        ? {
            color: withAlpha(
              normalizeColor(g.color, `layoutGrids[${i}].color`),
            ),
          }
        : {}),
    };
    // ROWS / COLUMNS 在三平台的 RowsColsLayoutGrid 里 gutterSize / count 都是**必填**,
    // alignment 同(Figma `readonly alignment: 'MIN'|'MAX'|'STRETCH'|'CENTER'`)。
    // count / gutterSize 没有可推断的默认值 —— 引擎遇到缺字段会丢掉整条网格且不报错,
    // 故这里明确报错而不是猜一个数。
    if (out.pattern === 'ROWS' || out.pattern === 'COLUMNS') {
      for (const key of ['count', 'gutterSize'] as const) {
        if (typeof out[key] !== 'number') {
          throw new Error(
            `layoutGrids[${i}].${key} 必填(pattern 为 ${String(out.pattern)} 时,三平台的 RowsColsLayoutGrid 都把它列为必填;缺它会丢掉整条网格)`,
          );
        }
      }
      // alignment 默认取 **STRETCH**(MG 设计器里「拉伸」就是默认;Figma 的栅格默认
      // 同样是拉伸)。此前补的是 MIN —— 而 MIN/MAX 分支下 `sectionSize` 是必填且
      // 无法凭空推断(见下),把默认设成 MIN 会让「只给 count + gutterSize」这种
      // 最常见写法直接被判缺字段,故改成 STRETCH:它只需要 offset(补 0 即可)。
      const align =
        typeof out.alignment === 'string' ? out.alignment : 'STRETCH';
      out.alignment = align;
      //
      // ⚠ sectionSize / offset 在 typings 里都标了 `?`,但**运行时按 alignment 分
      // 三套、且互斥**(jsDesign 实测 2026-09-24,引擎 `set_layoutGrids` 会逐变体校验,
      // 不匹配就整条拒绝):
      //   - STRETCH:必填 offset,**不能带** sectionSize(宽度由容器算出);
      //   - CENTER :必填 sectionSize,**不能带** offset;
      //   - MIN/MAX:两者都必填。
      // typings 的两条注释其实已经点明了(「Not set for alignment: STRETCH」 /
      // 「Not set for alignment: CENTER」),只是把可缺省读成了"随便给"。
      // 处理口径与 count / gutterSize 一致:能补的补(offset 补 0,三平台同默认),
      // 补不了的(sectionSize)报错点名 —— 不猜一个数把网格画错。
      if (align === 'STRETCH') {
        if (typeof out.offset !== 'number') out.offset = 0;
        delete out.sectionSize;
      } else if (align === 'CENTER') {
        requireSectionSize(out, i);
        delete out.offset;
      } else {
        // MIN / MAX
        requireSectionSize(out, i);
        if (typeof out.offset !== 'number') out.offset = 0;
      }
    }
    // GRID 三平台的 GridLayoutGrid 都只有 pattern + sectionSize(+ visible / color);
    // 多带 count / gutterSize / alignment 会让判别式联合匹配不上,故只保留该有的字段。
    if (out.pattern === 'GRID') {
      requireSectionSize(out, i);
      delete out.count;
      delete out.gutterSize;
      delete out.alignment;
      delete out.offset;
    }
    return out as unknown as LayoutGrid;
  });
}

/** ROWS/COLUMNS 的 MIN|MAX|CENTER 与 GRID 都需要 sectionSize:补不出来就报错点名 */
function requireSectionSize(out: Record<string, unknown>, i: number): void {
  if (typeof out.sectionSize !== 'number') {
    throw new Error(
      `layoutGrids[${i}].sectionSize 必填(pattern 为 ${String(out.pattern)}、alignment 为 ${String(out.alignment)} 时):该形态下引擎要求给出列宽/行高(或单元格大小),本仓无法凭空推断 —— 缺失会让整条网格被静默丢弃;不确定就改用 alignment: STRETCH(由容器算宽度)`,
    );
  }
}

/** 把 unknown 归一化成合法 Paint 数组;非数组直接抛错(引擎对非数组容器会报 not a function) */
export function normalizePaints(value: unknown, label: string): Paint[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `${label} 必须是数组,收到 ${value === null ? 'null' : Array.isArray(value) ? '数组' : typeof value}`,
    );
  }
  return value.map((raw, i) => normalizePaint(raw, `${label}[${i}]`));
}

function normalizePaint(raw: unknown, path: string): Paint {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`${path} 必须是 Paint 对象`);
  }
  const p = raw as Record<string, unknown>;
  switch (p.type) {
    case 'SOLID': {
      const color = normalizeColor(p.color, `${path}.color`);
      // 引擎 SolidPaint.color 只有 {r,g,b},a 移到 paint 级 opacity
      const out: Record<string, unknown> = {
        type: 'SOLID',
        color: { r: color.r, g: color.g, b: color.b },
      };
      if (typeof p.opacity === 'number') out.opacity = p.opacity;
      else if (color.a != null) out.opacity = color.a;
      if (typeof p.visible === 'boolean') out.visible = p.visible;
      if (typeof p.blendMode === 'string') out.blendMode = p.blendMode;
      return out as Paint;
    }
    case 'GRADIENT_LINEAR':
    case 'GRADIENT_RADIAL':
    case 'GRADIENT_ANGULAR': {
      // 渐变 Paint 没有 color 字段(SOLID 专属);多余 color 被丢弃,必需字段缺失则报错
      if (!Array.isArray(p.gradientStops)) {
        throw new Error(`${path}.gradientStops 必须是数组`);
      }
      if (!Array.isArray(p.gradientTransform)) {
        throw new Error(
          `${path}.gradientTransform 必须是矩阵,如 [[1,0,0],[0,1,0]]`,
        );
      }
      const gradientStops = p.gradientStops.map((s, i) => {
        const stop =
          typeof s === 'object' && s !== null && !Array.isArray(s)
            ? (s as Record<string, unknown>)
            : {};
        const c = normalizeColor(
          stop.color,
          `${path}.gradientStops[${i}].color`,
        );
        return {
          color: withAlpha(c),
          position: typeof stop.position === 'number' ? stop.position : 0,
        };
      });
      return {
        type: p.type,
        gradientStops,
        gradientTransform: p.gradientTransform as [
          [number, number, number],
          [number, number, number],
        ],
      } as Paint;
    }
    case 'IMAGE': {
      if (typeof p.imageHash !== 'string' || p.imageHash === '') {
        throw new Error(
          `${path}.imageHash 必须是非空字符串(图片填充需先经 jsd_fill_image 得到 hash)`,
        );
      }
      // scaleMode 在三平台的 typings 里都是 ImagePaint 的**必填**字段
      // (Figma/jsDesign 无 `?`;MasterGo 虽标可选,但缺它会走引擎自己的默认),
      // 线格式此前允许缺省 —— 缺省时整条 paint 可能被引擎判非法而静默丢弃。
      // 这里补成与 UI 一致的 FILL(裁满),调用方要别的缩放方式显式传。
      return {
        type: 'IMAGE',
        imageHash: p.imageHash,
        scaleMode:
          typeof p.scaleMode === 'string'
            ? p.scaleMode
            : DEFAULT_IMAGE_SCALE_MODE,
      } as Paint;
    }
    default:
      throw new Error(
        `${path}.type 不支持的填充类型: ${String(p.type)}(支持 SOLID|GRADIENT_LINEAR|GRADIENT_RADIAL|GRADIENT_ANGULAR|IMAGE)`,
      );
  }
}

/** 把 unknown 归一化成合法 Effect 数组(阴影缺 blendMode/visible 补默认值) */
export function normalizeEffects(value: unknown): Effect[] {
  if (!Array.isArray(value)) {
    throw new Error(
      `effects 必须是数组,收到 ${value === null ? 'null' : typeof value}`,
    );
  }
  return value.map((raw, i) => normalizeEffect(raw, `effects[${i}]`));
}

function normalizeEffect(raw: unknown, path: string): Effect {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`${path} 必须是 Effect 对象`);
  }
  const e = raw as Record<string, unknown>;
  switch (e.type) {
    case 'DROP_SHADOW':
    case 'INNER_SHADOW': {
      const color = normalizeColor(e.color, `${path}.color`);
      const offset =
        typeof e.offset === 'object' &&
        e.offset !== null &&
        !Array.isArray(e.offset)
          ? (e.offset as Record<string, unknown>)
          : {};
      const out: Record<string, unknown> = {
        type: e.type,
        color: withAlpha(color),
        offset: {
          x: typeof offset.x === 'number' ? offset.x : 0,
          y: typeof offset.y === 'number' ? offset.y : 0,
        },
        radius: typeof e.radius === 'number' ? e.radius : 0,
        // 引擎 DropShadowEffect/InnerShadowEffect 的 blendMode/visible 必填
        visible: typeof e.visible === 'boolean' ? e.visible : true,
        blendMode: typeof e.blendMode === 'string' ? e.blendMode : 'NORMAL',
      };
      if (typeof e.spread === 'number') out.spread = e.spread;
      if (
        e.type === 'DROP_SHADOW' &&
        typeof e.showShadowBehindNode === 'boolean'
      ) {
        out.showShadowBehindNode = e.showShadowBehindNode;
      }
      return out as Effect;
    }
    case 'LAYER_BLUR':
    case 'BACKGROUND_BLUR':
      return {
        type: e.type,
        radius: typeof e.radius === 'number' ? e.radius : 0,
        visible: typeof e.visible === 'boolean' ? e.visible : true,
      } as Effect;
    default:
      throw new Error(
        `${path}.type 不支持的阴影类型: ${String(e.type)}(支持 DROP_SHADOW|INNER_SHADOW|LAYER_BLUR|BACKGROUND_BLUR)`,
      );
  }
}

/** vectorPaths 归一化:data 必填,windingRule 缺省 NONZERO(引擎对 undefined 直接抛错) */
export function normalizeVectorPaths(paths: unknown): VectorPath[] {
  if (!Array.isArray(paths)) {
    throw new Error(
      `vectorPaths 必须是数组,收到 ${paths === null ? 'null' : typeof paths}`,
    );
  }
  return paths.map((p, i) => {
    if (typeof p !== 'object' || p === null || Array.isArray(p)) {
      throw new Error(
        `vectorPaths[${i}] 必须是 {data: string, windingRule?: string}`,
      );
    }
    const o = p as Record<string, unknown>;
    if (typeof o.data !== 'string' || o.data.trim() === '') {
      throw new Error(`vectorPaths[${i}].data 必须是 SVG path 字符串`);
    }
    return {
      data: o.data,
      windingRule: (o.windingRule ?? 'NONZERO') as
        | 'NONZERO'
        | 'EVENODD'
        | 'NONE',
    };
  });
}

/** BOOLEAN_OPERATION 运算类型白名单校验,防止非法值在 combine[op] 处触发 "not a function" */
export function assertBooleanOperation(op: unknown): BooleanOperation {
  if (
    typeof op === 'string' &&
    (BOOLEAN_OPERATIONS as readonly string[]).includes(op)
  ) {
    return op as BooleanOperation;
  }
  throw new Error(
    `不支持的布尔运算: ${String(op)}(支持 ${BOOLEAN_OPERATIONS.join('|')})`,
  );
}
