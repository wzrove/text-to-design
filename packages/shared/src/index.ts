import type { z } from 'zod';
import type { ActivityPushFrame } from './activity-channel';
import type { ServerStatusFrame } from './connection';
import type { ConsentPushFrame } from './consent-channel';
import type { PluginError } from './dicts/error-code';
import type { LogLevel, LogRecord } from './dicts/log';
import type * as s from './schemas';
import type { VersionPushFrame } from './version-channel';

/* 工具活动提醒(daemon 在 tools/call 前后推相位 → 面板最小化态) */
export * from './activity-channel';
/* 相机锁定(UI 发意图,code 侧在 viewport 契约层拦截) */
export * from './camera-lock';
/* 连接层协议(端口/握手帧/重连节奏):daemon 与插件 UI 的唯一真源 */
export * from './connection';
/* 错误上报同意的跨侧契约(UI 遥控 daemon 门控,旁路帧不过 MCP) */
export * from './consent-channel';
/* 平台无关核心逻辑(DesignHost 接口 + 序列化/建节点/组件/更新,无平台 typings 依赖) */
export * from './core';
/* 跨侧字典数据(节点类型/平台/日志级别/布尔运算的取值与文案真源) */
export * from './dicts';
/* 插件面板尺寸契约(UI ↔ code 的初值、夹取区间与自改高度旁路消息) */
export * from './locale-channel';

export * from './panel';
/* 重新导出 zod schemas(唯一真源,供 MCP 运行时校验复用) */
export * from './schemas';
/* 版本升级提示的跨侧契约(daemon 代查 npm latest → 推送给面板,见 0038) */
export * from './version-channel';

// 由 schema 推导的领域类型
export type PingParams = z.infer<typeof s.pingSchema>;
export type GetSelectionParams = z.infer<typeof s.getSelectionSchema>;
export type ExecuteParams = z.infer<typeof s.executeSchema>;
export type CreateSvgParams = z.infer<typeof s.createSvgSchema>;
export type SetFillParams = z.infer<typeof s.setFillParamsSchema>;
export type SetStrokeParams = z.infer<typeof s.setStrokeParamsSchema>;
export type SetCornerRadiusParams = z.infer<
  typeof s.setCornerRadiusParamsSchema
>;
export type SetTextParams = z.infer<typeof s.setTextParamsSchema>;
export type MoveParams = z.infer<typeof s.moveParamsSchema>;
export type ResizeParams = z.infer<typeof s.resizeParamsSchema>;
export type SetLayoutParams = z.infer<typeof s.setLayoutParamsSchema>;
export type SetEffectsParams = z.infer<typeof s.setEffectsParamsSchema>;
export type SetVisibilityParams = z.infer<typeof s.setVisibilityParamsSchema>;
export type RenameParams = z.infer<typeof s.renameParamsSchema>;
export type SetShapeParams = z.infer<typeof s.setShapeParamsSchema>;
export type NodeOpParams = z.infer<typeof s.manageNodesSchema>;
export type ComponentOpParams = z.infer<typeof s.manageComponentsSchema>;
export type ExportParams = z.infer<typeof s.exportSchema>;
export type FillImageParams = {
  ids: string[];
  bytes?: Uint8Array;
  hasBinary?: boolean;
};
export type ListFontsParams = z.infer<typeof s.listFontsSchema>;
export type ListStylesParams = z.infer<typeof s.listStylesSchema>;
export type CreateStyleParams = z.infer<typeof s.createStyleSchema>;
export type DeleteStyleParams = z.infer<typeof s.deleteStyleSchema>;
export type GetPageStructureParams = z.infer<typeof s.getPageStructureSchema>;

export type PingResult = z.infer<typeof s.pingResultSchema>;
export type GetSelectionResult = z.infer<typeof s.getSelectionResultSchema>;
export type CreatedResult = z.infer<typeof s.createdResultSchema>;
export type UpdatedResult = z.infer<typeof s.updatedResultSchema>;
export type ManageNodesResult = z.infer<typeof s.manageNodesResultSchema>;
export type ManageComponentsResult = z.infer<
  typeof s.manageComponentsResultSchema
>;
export type ExportResult = z.infer<typeof s.exportResultSchema>;
export type BatchParams = z.infer<typeof s.batchSchema>;
export type BatchCall = z.infer<typeof s.batchCallSchema>;
export type BatchResult = z.infer<typeof s.batchResultSchema>;

/**
 * 方法 → params 类型的方法表(唯一真源)。
 *
 * 此前这份映射手抄了四份:本表的键、PluginMethod 联合、RequestParams 的条件链、
 * PluginRequest 的联合成员;少写一份不报错 —— 条件链末尾落在 ListFontsParams 兜底,
 * 漂移是静默的。现在四者都由本表派生,新增方法只改这一处。
 * (运行期的字段白名单 PROP_METHOD_FIELDS 仍由 schemas/split-ops 的 *Props 派生,
 * 与本表的键集对等由 prop-method-parity.test.ts 守。)
 */
export type ParamsByMethod = {
  ping: PingParams;
  get_selection: GetSelectionParams;
  get_page: GetPageStructureParams;
  execute: ExecuteParams;
  create_svg: CreateSvgParams;
  find: s.FindParams;
  export: ExportParams;
  fill_image: FillImageParams;
  list_fonts: ListFontsParams;
  list_styles: ListStylesParams;
  create_style: CreateStyleParams;
  delete_style: DeleteStyleParams;
  node_op: NodeOpParams;
  component_op: ComponentOpParams;
  platform_op: s.PlatformOpParams;
  /** 属性引擎方法:每个方法各一份 params 线格式,params.props 只含本方法白名单内的字段 */
  set_fill: SetFillParams;
  set_stroke: SetStrokeParams;
  set_corner_radius: SetCornerRadiusParams;
  set_text: SetTextParams;
  move: MoveParams;
  resize: ResizeParams;
  set_layout: SetLayoutParams;
  set_effects: SetEffectsParams;
  set_visibility: SetVisibilityParams;
  rename: RenameParams;
  set_shape: SetShapeParams;
};

export type PluginMethod = keyof ParamsByMethod;

/** 属性引擎方法 → 各自专属的 params 类型(不再共用一份 50 键大表)。
 *  导出以便 __tests__ 对它与 PropMethod 做编译期对等断言(见 prop-method-parity.test.ts)。 */
export type PropParamsByMethod = Pick<
  ParamsByMethod,
  | 'set_fill'
  | 'set_stroke'
  | 'set_corner_radius'
  | 'set_text'
  | 'move'
  | 'resize'
  | 'set_layout'
  | 'set_effects'
  | 'set_visibility'
  | 'rename'
  | 'set_shape'
>;

export type RequestParams<M extends PluginMethod> = ParamsByMethod[M];

export type PluginRequest = {
  [M in PluginMethod]: {
    type: 'request';
    id: string;
    method: M;
    params: ParamsByMethod[M];
  };
}[PluginMethod];

export type PluginResponse<D = unknown> = {
  type: 'response';
  id: string;
  ok: boolean;
  data?: D;
  error?: PluginError;
  hasBinary?: boolean;
  binaryCount?: number;
};

/** 服务器主动下发的推送帧(daemon → 插件 UI,单向通知,无需回包) */
export type ServerPush =
  | {
      type: 'log';
      /** 结构化日志:与遥测上报同一形状(见 shared/dicts/log 的 LogRecord) */
      record?: LogRecord;
      /** 兼容旧 UI:record 缺席时按这两项渲染(新 daemon 两样都给) */
      level: LogLevel;
      line: string;
    }
  | ServerStatusFrame
  | VersionPushFrame
  | ActivityPushFrame
  | ConsentPushFrame;
export function makeResponse<D>(
  id: string,
  ok: boolean,
  data?: D,
  error?: PluginError,
): PluginResponse<D> {
  return { type: 'response', id, ok, data, error };
}

/** 插件 exportNodes 原始返回(keyed by id,含二进制字节) */
export interface RawExportMap {
  exports: Record<string, s.RawExportFile>;
}
