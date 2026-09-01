import type { Effect, Paint, VectorPath } from '../schemas';

/**
 * 引擎赋值前的归一化(平台无关,防御纵深):
 * zod 边界校验拦截不到的载荷(嵌套 children、jsd_batch 直调、旧客户端等)走到这里,
 * 把常见的「引擎会拒收」的形状修好,修不了就抛带路径的中文错误,避免引擎抛出
 * "in set_fills / in set_effects" 这类难懂错误。
 */

const BOOLEAN_OPERATIONS = [
  'UNION',
  'SUBTRACT',
  'INTERSECT',
  'EXCLUDE',
] as const;

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

/** 颜色通道归一化:0-255 → 0-1(任一路 >1 视为 0-255 输入,整组 /255);0-1 原样保留 */
function normalizeColor(raw: unknown, path: string): NormalizedColor {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`${path} 必须是颜色对象 {r,g,b[,a]}`);
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
          color: { r: c.r, g: c.g, b: c.b, a: c.a ?? 1 },
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
      return {
        type: 'IMAGE',
        imageHash: p.imageHash,
        ...(typeof p.scaleMode === 'string' ? { scaleMode: p.scaleMode } : {}),
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
        color: { r: color.r, g: color.g, b: color.b, a: color.a ?? 1 },
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
export function assertBooleanOperation(
  op: unknown,
): 'UNION' | 'SUBTRACT' | 'INTERSECT' | 'EXCLUDE' {
  if (
    typeof op === 'string' &&
    (BOOLEAN_OPERATIONS as readonly string[]).includes(op)
  ) {
    return op as 'UNION' | 'SUBTRACT' | 'INTERSECT' | 'EXCLUDE';
  }
  throw new Error(
    `不支持的布尔运算: ${String(op)}(支持 ${BOOLEAN_OPERATIONS.join('|')})`,
  );
}
