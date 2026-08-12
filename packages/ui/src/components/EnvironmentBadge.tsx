import type { PluginPlatform } from 'text-to-design-shared';

const LABEL: Record<PluginPlatform, string> = {
  jsdesign: '即时设计',
  figma: 'Figma',
};

/** 当前插件运行平台(jsDesign/Figma)显示 */
export default function EnvironmentBadge({
  platform,
}: {
  platform: PluginPlatform | null;
}) {
  if (!platform) return null;
  return (
    <span class="badge badge-sm badge-neutral gap-1 shrink-0 font-mono">
      {LABEL[platform]}
    </span>
  );
}
