---
title: "组件属性定义与设值"
when: "当需要定义组件属性或修改实例文本、布尔、换绑与变体取值时读取；按平台能力选择入口并核对可见图层引用。"
args: "参数 target(组件或实例 id)"
role: assistant
---
# 组件属性定义与实例设值

用于定义组件属性或修改实例的文本、布尔、换绑与变体取值。构建状态族见 [变体集](variant-set.md)。

## 先认准层与键

- **定义**在 COMPONENT / COMPONENT_SET 上，通过当前 platformOps 提供的入口操作。
- **设值**在 INSTANCE 上，使用 `jsd_set_instance_properties`。
- 先 find 读取 variantProperties、componentProperties 及可见子层的 componentPropertyReferences。属性存在不代表它驱动画面；按图层引用认准目标键。
- 变体键用维度名，如 状态；文本、布尔、换绑键保留读取到的完整 # 后缀，如 `标题#32:0`。短名只在基名唯一时会被补全，重名须选准确键。
- 变体可选值从组件集 variantGroupProperties、assets.variants 或平台读取 op 取，不猜新值。

## 按平台写值

| 环境 | 可用形态与边界 |
| --- | --- |
| Figma | string、boolean；支持的组件属性可传 VARIABLE_ALIAS |
| MasterGo | string、boolean；组件属性与变量关系可读，但本仓写入口不接变量别名 |
| 即时设计 | 声明签名仅 string，读侧没有通用 componentProperties；运行期 setProperties 可能不可用，不强试缺少属性面的实例 |

变体取值传字符串；布尔传 boolean；文本传 string；换绑值与显式类型按工具 schema。需要 VARIABLE_ALIAS 时，值形如 `{"type":"VARIABLE_ALIAS","id":"读取到的变量id"}`，只用于平台支持的 BOOLEAN / TEXT / INSTANCE_SWAP，不能绑定 VARIANT。

多个实例写相同 properties 时合并 ids；不同取值按组分 batch 步骤。复制已有覆盖见 [实例同步](variant-sync.md)。

## 验收

独立回读属性 value，再深读可见子层的 characters / visible 等实际结果；仅属性回显改变不能证明渲染改变。导出代表实例检查文案、显隐和尺寸。

实例子层样式覆盖未生效时，按 warnings 的主组件子层 id 定位。全局修改改主件；局部修改保留用户指定范围，不以改主件替代单实例需求。
