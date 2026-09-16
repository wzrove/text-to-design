import { PLATFORM_LABEL, type PluginPlatform } from 'text-to-design-shared';

/** 当前插件运行平台(jsDesign/Figma)显示;平台名取自 shared 平台字典 */
export default function EnvironmentBadge({
  platform,
}: {
  platform: PluginPlatform | null;
}) {
  if (!platform) return null;
  return (
    <span class="badge badge-sm badge-neutral gap-1 shrink-0 font-mono">
      {PLATFORM_LABEL[platform]}
    </span>
  );
}
