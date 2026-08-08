import type { McpServer } from '@modelcontextprotocol/server';
import {
  manageComponentsResultSchema,
  manageComponentsSchema,
  manageNodesResultSchema,
  manageNodesSchema,
} from 'text-to-design-shared';
import type { Bridge } from '../bridge';
import { err, structured } from '../core/response';

/** 管理类:节点结构操作 + 组件/实例操作 */
export function registerManageTools(server: McpServer, bridge: Bridge): void {
  server.registerTool(
    'jsd_manage_nodes',
    {
      description:
        '对节点执行结构操作。按 op 分发:select 设置选中 / remove 删除 / clone 复制(右下偏移24px) / group 编组 / ungroup 取消编组 / flatten 合并为单个矢量 / outline_stroke 描边转矢量轮廓 / reparent 移动到目标父节点下 / repair 清理引擎残留的失效节点(wrapper 移除后遗留 dangling,读 layoutGrow 等属性报 jsGet undefined 时先跑这个)',
      inputSchema: manageNodesSchema,
      outputSchema: manageNodesResultSchema,
    },
    async (params) => {
      try {
        const data = await bridge.request('node_op', params);
        return structured(data, manageNodesResultSchema);
      } catch (e) {
        return err(e, manageNodesResultSchema);
      }
    },
  );

  server.registerTool(
    'jsd_manage_components',
    {
      description:
        '组件/实例操作。按 op 分发:create_component 创建组件(建空壳,子节点需另用 reparent 归组进来) / create_instance 从组件生成实例 / detach_instance 解绑实例(转 Frame) / import_component 从团队库按 key 导入 / swap_component 交换实例组件 / set_instance_properties 设置变体属性 / combine_as_variants 合并为组件集(基于副本,保留原组件)',
      inputSchema: manageComponentsSchema,
      outputSchema: manageComponentsResultSchema,
    },
    async (params) => {
      try {
        const data = await bridge.request('component_op', params);
        return structured(data, manageComponentsResultSchema);
      } catch (e) {
        return err(e, manageComponentsResultSchema);
      }
    },
  );
}
