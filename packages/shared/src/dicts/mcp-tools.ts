export const MCP_CORE_TOOLS: readonly string[] = [
  'jsd_ping',
  'jsd_get_page',
  'jsd_get_selection',
  'jsd_copy',
  'jsd_find',
  'jsd_list_fonts',
  'jsd_export',
  'jsd_list_prompts',
  'jsd_get_prompt',
  'jsd_batch',
];

export const MCP_LEGACY_TOOLS: readonly string[] = [
  'jsd_manage_nodes',
  'jsd_manage_components',
];

export const MCP_TOOL_GROUPS: Readonly<Record<string, readonly string[]>> = {
  session: [
    'jsd_ping',
    'jsd_get_page',
    'jsd_get_selection',
    'jsd_copy',
    'jsd_find',
    'jsd_list_fonts',
  ],
  create: [
    'jsd_create_frame',
    'jsd_create_rectangle',
    'jsd_create_text',
    'jsd_create_ellipse',
    'jsd_create_line',
    'jsd_create_polygon',
    'jsd_create_star',
    'jsd_create_vector',
    'jsd_create_group',
    'jsd_create_boolean_operation',
  ],
  nodes: [
    'jsd_select_nodes',
    'jsd_delete_node',
    'jsd_clone_node',
    'jsd_group_nodes',
    'jsd_ungroup_nodes',
    'jsd_flatten_nodes',
    'jsd_outline_stroke',
    'jsd_reparent_nodes',
    'jsd_repair_nodes',
    'jsd_manage_nodes',
  ],
  components: [
    'jsd_create_component',
    'jsd_create_instance',
    'jsd_detach_instance',
    'jsd_import_component',
    'jsd_swap_component',
    'jsd_set_instance_properties',
    'jsd_combine_as_variants',
    'jsd_copy_overrides',
    'jsd_apply_overrides',
    'jsd_sync_overrides',
    'jsd_manage_components',
  ],
  props: [
    'jsd_set_fill_color',
    'jsd_set_stroke',
    'jsd_set_cornerRadius',
    'jsd_set_text',
    'jsd_move_node',
    'jsd_resize_node',
    'jsd_set_layout',
    'jsd_set_effects',
    'jsd_set_visibility',
    'jsd_rename_node',
    'jsd_set_shape',
  ],
  media: [
    'jsd_create_svg',
    'jsd_create_icon',
    'jsd_html_to_design',
    'jsd_export',
    'jsd_fill_image',
  ],
  styles: ['jsd_create_style', 'jsd_delete_style'],
  guidance: ['jsd_list_prompts', 'jsd_get_prompt', 'jsd_describe_tools'],
  platform: ['jsd_platform_op'],
  orchestration: ['jsd_batch'],
};

export const MCP_TOOL_GUIDANCE = {
  'zh-CN': {
    full: '工具目录为兼容档。画布绘制与多步编辑优先用 jsd_batch；单步也可直接调用专责工具。',
    compact:
      '默认精简档。画布绘制与编辑统一用 jsd_batch，一次操作也可提交单步。已知步骤工具名时，直接用 jsd_describe_tools 的 names 取 schema；名称未知时先按 group/query 查找。同值批改在一个步骤里合并 ids。',
    title: '查询可用工具与参数',
    description:
      '按 group/query 分页查看内部能力摘要；按 names（最多 3 个）读取完整输入 schema、结果键和风险。未公开工具仅通过 jsd_batch 执行。只读、离线可用；查询不会改变公开目录。',
  },
  en: {
    full: 'Compatibility catalog. Prefer jsd_batch for drawing and multi-step edits. Single operations can also be called directly.',
    compact:
      'Default compact catalog. Use jsd_batch for canvas creation and edits, including single steps. Fetch schemas with jsd_describe_tools names when known, or discover names with group/query first. Combine ids in one step for identical edits.',
    title: 'Discover tools and parameters',
    description:
      'Page through capability summaries with group/query; pass names (up to 3) for full input schemas, result keys and risk hints. Execute non-public tools through jsd_batch. Read-only, available offline; discovery never changes the public catalog.',
  },
} as const;
