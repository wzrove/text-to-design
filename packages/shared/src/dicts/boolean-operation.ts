/**
 * 布尔运算字典(唯一真源):运算方式全表 + 中文名。
 *
 * 白名单原先只存在于 core/normalize 的校验常量,zod 枚举与两处工具描述各写一遍
 * (含 mcp-server 工具描述里的 `UNION/SUBTRACT/INTERSECT/EXCLUDE`),此处收敛。
 */

/** 引擎支持的布尔运算(白名单;顺序即提示顺序) */
export const BOOLEAN_OPERATIONS = [
  'UNION',
  'SUBTRACT',
  'INTERSECT',
  'EXCLUDE',
] as const;

export type BooleanOperation = (typeof BOOLEAN_OPERATIONS)[number];

/** 运算 → 中文名 */
export const BOOLEAN_OPERATION_LABEL: Record<BooleanOperation, string> = {
  UNION: '合并',
  SUBTRACT: '减去',
  INTERSECT: '相交',
  EXCLUDE: '排除',
};

/** 斜杠串:`UNION/SUBTRACT/INTERSECT/EXCLUDE`(工具描述里列可选值时用) */
export const BOOLEAN_OPERATION_LIST = BOOLEAN_OPERATIONS.join('/');

/** zod describe 文案:`布尔运算:UNION=合并,SUBTRACT=减去,…` */
export const BOOLEAN_OPERATION_DESCRIBE = `布尔运算:${BOOLEAN_OPERATIONS.map(
  (op) => `${op}=${BOOLEAN_OPERATION_LABEL[op]}`,
).join(',')}`;
