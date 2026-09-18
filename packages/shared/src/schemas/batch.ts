import { z } from 'zod';

// ---- 批量编排(jsd_batch):服务端顺序执行多步工具调用,前步结果注入后步 ----

export const batchCallSchema = z.object({
  id: z
    .string()
    .optional()
    .describe(
      '步骤唯一标识,供后续步骤以双花括号占位符(id.字段路径)引用本步结果;缺省自动命名 step1/step2/…',
    ),
  tool: z
    .string()
    .describe(
      '要执行的 jsd_* 工具名,如 jsd_create_rectangle / jsd_find / jsd_set_fill_color',
    ),
  args: z
    .record(z.string(), z.unknown())
    .optional()
    .describe(
      '该工具的完整入参;任意位置的字符串值里可放双花括号占位符(步骤id.字段路径)引用先前步骤结果',
    ),
  continueOnError: z
    .boolean()
    .optional()
    .describe(
      '本步【执行】失败时是否继续后续步骤;仅对执行失败生效,id 重复/未知工具/引用解析失败一律中止',
    ),
});
export type BatchCall = z.infer<typeof batchCallSchema>;

/** 与 manageComponentsSchema 同思路:扁平结构,schema 保持简单,语义约束由运行时给出 */
export const batchSchema = z.object({
  calls: z
    .array(batchCallSchema)
    .min(1)
    .max(50)
    .describe('按数组顺序执行的步骤列表'),
  stopOnError: z
    .boolean()
    .optional()
    .describe(
      '全局失败策略,默认 true=任一步执行失败即停止,false=配合单步走完全部',
    ),
  checkDrift: z
    .boolean()
    .optional()
    .describe(
      '是否对结构变更步骤做同层几何漂移复核,默认 true。步骤里含 remove/reparent/group/ungroup/flatten/repair 时:变更前记下受影响父层的子节点坐标,该步结束后再读一次比对,漂移写进结果 warnings(P25-B:引擎会把没碰到的兄弟静默挪走)。代价是每步多两次读数;确定不需要时传 false',
    ),
});
export type BatchParams = z.infer<typeof batchSchema>;

export const batchResultSchema = z.object({
  ok: z
    .boolean()
    .describe('全部步骤均执行且成功(executed 小于 total 即为中途停止)'),
  executed: z.number().int().min(0).describe('实际产生结果的步骤数'),
  total: z.number().int().min(0).describe('计划的步骤总数'),
  results: z
    .array(
      z.object({
        id: z.string(),
        tool: z.string(),
        ok: z.boolean(),
        data: z
          .unknown()
          .optional()
          .describe(
            '成功时该工具的 structuredContent(已做回显摘要裁剪,见工具描述)',
          ),
        error: z.string().optional().describe('失败原因(人读文本)'),
      }),
    )
    .describe('各步骤结果,顺序与入参一致;被中止而未执行的步骤不出现在此列表'),
  /**
   * P22:回显里的节点只留摘要字段、丢 vectorPaths 等大字段;裁剪后仍超预算的步骤
   * 降级为 id 清单。置 true 时说明有步骤的回显被压缩过 —— 需要细节请把该工具单独
   * 调用一次(占位符解析不受影响,内部用的是完整数据)。
   */
  echoTrimmed: z.boolean().optional(),
  /**
   * P25-B:结构变更类批次收尾的同层几何复核结果。引擎在批量删除/移父后会重算同层
   * 约束,把本次操作没触及的节点静默挪走(无报错、回显正常),这里点名并给出原值。
   */
  warnings: z.array(z.string()).optional(),
});
export type BatchResult = z.infer<typeof batchResultSchema>;

/** 平台特有操作结果:plugin 统一回 {ok, data},data 结构随 op 而定 */
export const platformOpResultSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
});
export type PlatformOpResult = z.infer<typeof platformOpResultSchema>;
