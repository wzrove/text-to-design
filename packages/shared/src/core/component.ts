import type { SerializedNode } from '../schemas';
import type { DesignHost, NodeSkeleton } from './host';
import { serializeNode } from './serialize';
import { findNode } from './utils';

export function createComponentNodes(
  host: DesignHost,
  params: { ids: string[]; name?: string },
): { created: SerializedNode } {
  const nodes = findNode(host, params.ids);
  if (nodes.length === 0) {
    throw new Error('没有找到要固化为组件的节点');
  }
  // 只建空壳组件:不要 appendChild 已有节点(会触发引擎卷进 wrapper,
  // 后续删 wrapper 连坐删子树并残留 dangling,影响整图序列化)。
  // 子节点由调用方用 reparent 归组进来。
  const component = host.createComponent();
  component.name = params.name ?? 'component';
  host.viewport.scrollAndZoomIntoView([component]);
  return { created: serializeNode(component) };
}

export function createInstances(
  host: DesignHost,
  ids: string[],
): { created: SerializedNode[] } {
  const nodes = findNode(host, ids);
  const components = nodes.filter((n) => n.type === 'COMPONENT');
  if (components.length === 0) {
    throw new Error('没有找到可实例化的组件节点');
  }
  const page = host.currentPage;
  const created: NodeSkeleton[] = [];
  const center = host.viewport.center;
  for (const c of components) {
    const inst = c.createInstance();
    page.appendChild(inst);
    inst.x = center.x - inst.width / 2;
    inst.y = center.y - inst.height / 2;
    created.push(inst);
  }
  host.viewport.scrollAndZoomIntoView(created);
  return { created: created.map((n) => serializeNode(n)) };
}

export function swapComponents(
  host: DesignHost,
  params: { ids: string[]; componentId: string },
): { swapped: SerializedNode[] } {
  const component = findNode(host, [params.componentId]).find(
    (n) => n.type === 'COMPONENT',
  );
  if (!component) {
    throw new Error(`没有找到组件: ${params.componentId}`);
  }
  const instances = findNode(host, params.ids).filter(
    (n) => n.type === 'INSTANCE',
  );
  if (instances.length === 0) {
    throw new Error('没有找到要交换的实例节点');
  }
  for (const inst of instances) {
    inst.swapComponent(component);
  }
  return { swapped: instances.map((n) => serializeNode(n)) };
}

export function setInstanceProperties(
  host: DesignHost,
  params: { ids: string[]; properties: Record<string, string> },
): { updated: SerializedNode[] } {
  const instances = findNode(host, params.ids).filter(
    (n) => n.type === 'INSTANCE',
  );
  if (instances.length === 0) {
    throw new Error('没有找到要设置的实例节点');
  }
  // 运行时校验:属性名必须属于实例的合法变体属性
  for (const inst of instances) {
    const compSet = inst.mainComponent?.parent;
    const variantProps =
      compSet != null && compSet.type === 'COMPONENT_SET'
        ? compSet.variantGroupProperties
        : undefined;
    if (variantProps) {
      const validKeys = Object.keys(variantProps);
      const invalidKeys = Object.keys(params.properties).filter(
        (k) => !validKeys.includes(k),
      );
      if (invalidKeys.length > 0) {
        throw new Error(
          `非法变体属性:${invalidKeys.join(',')}。合法属性:${validKeys.join(',')}`,
        );
      }
    }
    inst.setProperties(params.properties);
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

export function combineAsVariantsNodes(
  host: DesignHost,
  params: { ids: string[]; name?: string },
): { created: SerializedNode } {
  const components = findNode(host, params.ids).filter(
    (n) => n.type === 'COMPONENT',
  );
  if (components.length < 2) {
    throw new Error('combine_as_variants 至少需要 2 个组件节点');
  }
  // 用 clone 副本合并,保留原组件:原组件不被卷进 SET,删 SET 只删副本,免残留。
  const clones = components.map((c) => c.clone());
  const set = host.combineAsVariants(clones, host.currentPage);
  if (params.name != null) set.name = params.name;
  host.viewport.scrollAndZoomIntoView([set]);
  return { created: serializeNode(set) };
}

export function detachInstanceNodes(
  host: DesignHost,
  ids: string[],
): {
  created: SerializedNode[];
} {
  const instances = findNode(host, ids).filter((n) => n.type === 'INSTANCE');
  if (instances.length === 0) {
    throw new Error('没有找到要解绑的实例节点');
  }
  // 防御性检查:实例必须有 mainComponent 才能解绑
  const invalidInstances = instances.filter((n) => !n.mainComponent);
  if (invalidInstances.length > 0) {
    throw new Error(
      `以下实例的 mainComponent 已失效,无法解绑:${invalidInstances.map((n) => n.id).join(',')}。建议先运行 repair 清理失效节点`,
    );
  }
  const detached = instances.map((n) => n.detachInstance());
  host.viewport.scrollAndZoomIntoView(detached);
  return { created: detached.map((n) => serializeNode(n)) };
}
