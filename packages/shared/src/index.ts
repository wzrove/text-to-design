import type { z } from 'zod';
import type * as s from './schemas';

export const WS_PORT = 47812;

/** 日志级别(daemon logger 与插件面板日志面板共用) */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/* 平台无关核心逻辑(DesignHost 接口 + 序列化/建节点/组件/更新,无平台 typings 依赖) */
export * from './core';
/* 重新导出 zod schemas(唯一真源,供 MCP 运行时校验复用) */
export * from './schemas';

// 由 schema 推导的领域类型
export type PingParams = z.infer<typeof s.pingSchema>;
export type GetSelectionParams = z.infer<typeof s.getSelectionSchema>;
export type ExecuteParams = z.infer<typeof s.executeSchema>;
export type CreateSvgParams = z.infer<typeof s.createSvgSchema>;
export type UpdateNodeParams = z.infer<typeof s.updateNodeSchema>;
export type NodeOpParams = z.infer<typeof s.manageNodesSchema>;
export type ComponentOpParams = z.infer<typeof s.manageComponentsSchema>;
export type ExportParams = z.infer<typeof s.exportSchema>;
export type FillImageParams = {
  ids: string[];
  bytes?: Uint8Array;
  hasBinary?: boolean;
};
export type ListFontsParams = z.infer<typeof s.listFontsSchema>;

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

export type PluginMethod =
  | 'ping'
  | 'get_selection'
  | 'execute'
  | 'create_svg'
  | 'update_node'
  | 'find'
  | 'export'
  | 'list_fonts'
  | 'fill_image'
  | 'node_op'
  | 'component_op'
  | 'platform_op';

export type RequestParams<M extends PluginMethod> = M extends 'ping'
  ? PingParams
  : M extends 'get_selection'
    ? GetSelectionParams
    : M extends 'execute'
      ? ExecuteParams
      : M extends 'create_svg'
        ? CreateSvgParams
        : M extends 'update_node'
          ? UpdateNodeParams
          : M extends 'find'
            ? s.FindParams
            : M extends 'export'
              ? ExportParams
              : M extends 'fill_image'
                ? FillImageParams
                : M extends 'node_op'
                  ? NodeOpParams
                  : M extends 'component_op'
                    ? ComponentOpParams
                    : M extends 'platform_op'
                      ? s.PlatformOpParams
                      : ListFontsParams;

export type PluginRequest = (
  | { type: 'request'; id: string; method: 'ping'; params: PingParams }
  | {
      type: 'request';
      id: string;
      method: 'get_selection';
      params: GetSelectionParams;
    }
  | { type: 'request'; id: string; method: 'execute'; params: ExecuteParams }
  | {
      type: 'request';
      id: string;
      method: 'create_svg';
      params: CreateSvgParams;
    }
  | {
      type: 'request';
      id: string;
      method: 'update_node';
      params: UpdateNodeParams;
    }
  | { type: 'request'; id: string; method: 'find'; params: s.FindParams }
  | { type: 'request'; id: string; method: 'export'; params: ExportParams }
  | {
      type: 'request';
      id: string;
      method: 'fill_image';
      params: FillImageParams;
    }
  | { type: 'request'; id: string; method: 'node_op'; params: NodeOpParams }
  | {
      type: 'request';
      id: string;
      method: 'component_op';
      params: ComponentOpParams;
    }
  | {
      type: 'request';
      id: string;
      method: 'list_fonts';
      params: ListFontsParams;
    }
  | {
      type: 'request';
      id: string;
      method: 'platform_op';
      params: s.PlatformOpParams;
    }
) & {
  /** 目标 MCP server 端口;缺省时路由到第一个已连接 server */
  server?: number;
};

export type PluginResponse<D = unknown> = {
  type: 'response';
  id: string;
  ok: boolean;
  data?: D;
  error?: string;
  hasBinary?: boolean;
  binaryCount?: number;
};

/** 服务器主动下发的推送帧(daemon → 插件 UI,单向通知,无需回包) */
export type ServerPush =
  | { type: 'log'; level: LogLevel; line: string }
  | { type: 'status'; state: string; version?: string };
export function makeResponse<D>(
  id: string,
  ok: boolean,
  data?: D,
  error?: string,
): PluginResponse<D> {
  return { type: 'response', id, ok, data, error };
}

/** 插件 exportNodes 原始返回(keyed by id,含二进制字节) */
export interface RawExportMap {
  exports: Record<string, s.RawExportFile>;
}
