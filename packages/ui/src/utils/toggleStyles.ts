/**
 * 档位控件(语言 / Copy 模式 / 角色 / 相机锁)共用的中性色阶。
 *
 * 面板底色是中性灰 base-200,`bg-base-content/10` 一档在这种底上几乎看不出选中;
 * 这里把三档拆开:
 * - 轨道:base-300/35,比页底深半档,先框出「这是一个控件」;
 * - 选中:base-content/15 + 30% 描边 + 实心文字,深浅两层同时表达;
 * - 未选中:透明描边(布局不跳)+ 55% 文字,悬停给 5% 底。
 *
 * 不用 primary:页头只有状态徽章用语义色,其余档位保持中性,避免彩色抢注意力
 * (相机锁的既有口径)。所有值仍是主题 token,亮暗自动换档。
 */
export const TOGGLE_TRACK =
  'rounded border border-base-300 bg-base-300/55 p-0.5';

export const TOGGLE_ACTIVE =
  'border-base-content/30 bg-base-content/15 text-base-content';

export const TOGGLE_IDLE =
  'border-transparent text-base-content/55 hover:bg-base-content/5 hover:text-base-content';
