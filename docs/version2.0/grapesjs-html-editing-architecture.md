# Tabi 2.0 GrapesJS HTML 编辑技术方案

## 1. 这份文档解决什么问题

主 rollout 计划已经决定在 Tabi 2.0 里接入 GrapesJS，但还缺一层更底的技术说明：

- GrapesJS 到底是不是“直接编辑 HTML 字符串”
- 我们当前持久化的单文件 handbook HTML，应该如何喂给 GrapesJS
- 视觉编辑结束后，应该如何无缝回写到现有 `Handbook.html` 保存链路
- 原型 `ZA6gt` 里的右侧工作区、文本工具条、区块工具条，哪些该交给 GrapesJS，哪些必须由我们自己实现

这份文档就是主计划的技术附录，给 `docs/superpowers/plans/2026-03-17-tabi-2-0-unified-workspace-rollout.md` 提供更细的 HTML 编辑架构依据。

## 2. 结论先说

结论很明确：

1. GrapesJS 不是在“原始 HTML 文本”上做原地字符串编辑。
2. GrapesJS 的工作方式是：先把 HTML 解析成 component model tree，再通过 component model、RTE、Style Manager、Asset Manager 等机制编辑，最后再导出 HTML/CSS。
3. 对 Tabi 2.0 来说，最稳妥的接入方式不是把完整 handbook 文档直接当成 GrapesJS 项目持久化，而是做一层 `handbook-html-adapter`：
   - 进入编辑器前：从完整 handbook HTML 中提取 `body` 内容和可编辑 CSS
   - 在编辑器里：让 GrapesJS 只管理 canvas 里的结构和样式
   - 保存时：用 `editor.getHtml()` + `editor.getCss()` 重建回现有单文件 handbook 文档
4. `ZA6gt` 里的右侧 `LsSX3` / `aTjVS`、`KREOj`、`saEP6` 不应该指望 GrapesJS 默认 UI 直接提供，而应该由我们自己的 React UI 驱动，GrapesJS 只提供选区、组件树和样式读写能力。
5. 当前 rollout 的目标是“用户手动编辑”，不是“AI 直接修改 component”。AI 对话框、Edit Agent、以及基于 GrapesJS API 的 MCP 封装都应该留到下一阶段。

一句话：

`GrapesJS 是 handbook canvas 的编辑引擎，不是 handbook artifact 的最终存储格式，也不是整个 Studio 壳。`

## 3. 官方资料显示 GrapesJS 如何编辑 HTML

### 3.1 导入阶段：HTML 会先被解析成 Component Definition

GrapesJS 官方文档说明，`editor.addComponents(...)` / `editor.setComponents(...)` 接收 HTML 字符串后，会先把它解析成 `Component Definition`，再为每个节点识别 component type。这个过程不是纯文本编辑，而是 HTML -> 组件模型的编译过程。

官方文档给出的过程是：

- HTML 字符串先被解析成带 `tagName`、`attributes`、`components` 的对象结构
- 解析时会遍历 `Component Type Stack`
- 通过各 component type 的 `isComponent` 判断当前节点应该绑定成什么类型
- 最终在编辑器内部形成可选中、可更新、可序列化的 component model tree

这意味着：

- 我们传进去的是 HTML
- 但编辑器内部真正维护的是 component model
- 后续所有“编辑 HTML”的行为，本质都是“编辑 component model，再导出 HTML”

### 3.2 编辑阶段：Component/Model 才是 source of truth

官方 Component 文档明确说，`Component/Model is your Source of Truth`。也就是说：

- 选中一个元素时，编辑器拿到的是 component model
- 修改属性、class、style、children，实际上是在更新 model
- Canvas 里的视图只是 model 的渲染结果
- 导出的 HTML 也是从 model tree 重新生成

这对我们很重要，因为它直接决定了 Tabi 2.0 的边界：

- 不能把 visual editor 的“当前值”理解成一段始终同步的原始 HTML 文本
- 应该把它理解为“一个可以导出 HTML/CSS 的中间编辑状态”
- 因此必须有 adapter 负责 `stored handbook html <-> editor state`

### 3.3 文本编辑：内置 RTE 负责 inline text editing

官方 Getting Started 和 RichTextEditor 文档说明：

- 双击 text component，会进入 GrapesJS 内置的 Rich Text Editor
- 内置 RTE 使用浏览器 HTML Editing APIs
- 官方建议让 RTE toolbar 尽量小，把复杂样式编辑交给 Style Manager
- 如果默认 RTE 不适合产品 UI，可以通过 `editor.setCustomRte(...)` 替换

这基本对应了原型里的 `KREOj`：

- `Bold`
- `Italic`
- `Underline`
- `Strike`
- `Link`
- `Image`
- 以及部分文本样式入口

换句话说，`KREOj` 最适合建立在 GrapesJS 的 text selection / RTE 生命周期之上，而不是我们自己从 iframe 里裸抓选区。

### 3.4 样式编辑：Style Manager 可以自定义成我们自己的右侧面板

官方 Style Manager 文档说明：

- Style Manager 默认是按 sector/property 组织的样式面板
- 也可以完全禁用默认 UI，自定义为我们自己的 UI
- 做法是 `styleManager.custom = true`，然后订阅 `style:custom`
- 之后可以通过 Style Manager API 或 selected target 直接驱动样式更新

这与 `ZA6gt` 里的右侧 `LsSX3` 是高度契合的：

- `LsSX3` 不是通用后台面板，而是 selection-aware 的产品面板
- 所以不该直接照搬 GrapesJS 默认 style panel
- 更合理的做法是保留 GrapesJS 的样式能力，把 UI 换成我们自己的 React 控件

### 3.5 图片/素材编辑：Asset Manager 也可以自定义

官方 Asset Manager 文档说明：

- 图片组件默认可打开 Asset Manager
- Asset Manager 默认 UI 可以替换
- 做法是 `assetManager.custom = true`，然后订阅 `asset:custom`
- 回调里会给到 `assets`、`select`、`remove`、`close`、`container` 等信息

这意味着原型里的素材选择弹层和图片替换流程可以继续是我们的产品 UI，而不是必须使用 GrapesJS 自带 modal。

所以对于原型里的：

- `KREOj` 的图片按钮
- `saEP6` 的图片/块级动作
- 以及素材选择弹层

更合理的方案是：

- 由我们的 React UI 打开自定义素材选择器
- 最终选择结果再写回当前 selected component

### 3.6 导出阶段：导出的是 canvas HTML/CSS，而不是完整 handbook shell

官方 Editor API 说明：

- `editor.getHtml()` 返回 canvas 里的 HTML
- `editor.getCss()` 返回 canvas 里的 CSS
- `editor.getDirtyCount()` / `editor.clearDirtyCount()` 可以管理脏状态
- `editor.getSelected()` 能拿到最后选中的 component

这里最关键的一点是：

`getHtml()` / `getCss()` 导出的是编辑器内部 canvas 状态，不等于我们的完整 handbook 单文件文档。  
完整 handbook 里还可能有：

- `<!doctype html>`
- `<html>` / `<head>` / `<body>`
- `<meta>` / `<title>`
- 站点级 `<style>`
- 未来可能的 schema、analytics、publish 相关注入

所以 Tabi 2.0 绝对需要一层文档壳重建逻辑，不能直接把 `getHtml()` 的结果当成最终持久化物。

## 4. 这对 Tabi 2.0 的真实含义

### 4.1 不建议把完整 handbook 文档直接原样塞进 GrapesJS 当唯一真相

虽然官方 Parser 支持 `parseHtml`，甚至有 `asDocument` 选项，但这并不意味着“把完整单文件 handbook 原样喂进去”就是最佳方案。

原因有几个：

1. GrapesJS 的核心编辑区域本质上是 wrapper/body 级内容，而不是一个完整 head/body 文档管理器。
2. Parser 默认会做 HTML 解析与规范化，`text/html` 模式下甚至会修正无效结构；这对编辑器来说是优点，但对我们做 artifact round-trip 来说意味着潜在结构漂移。
3. Parser 默认不允许 `<script>`、危险属性和危险属性值；这对安全是好事，但也说明“完整 handbook 文档”并不适合直接无脑 round-trip。
4. handbook 存储契约当前是 `Handbook.html` 单文件 artifact，而不是 GrapesJS project JSON；如果把完整文档直接变成 GrapesJS 内部项目格式，会把 rollout 范围推大。

### 4.2 推荐边界：adapter 只让 GrapesJS 负责可编辑的 body + editable CSS

推荐的数据边界如下：

#### 输入到 GrapesJS 前

从现有持久化 HTML 中提取：

- `documentShell`
  - doctype
  - html/body 属性
  - head 里需保留但不在 visual editor 中直接编辑的结构
- `editableBodyHtml`
  - 用于 `editor.setComponents(...)`
- `editableCss`
  - 用于 `editor.setStyle(...)`
- `documentMeta`
  - title
  - meta
  - 其他需要在重建时原样保留的信息

#### 在 GrapesJS 内部

- GrapesJS 管理 `editableBodyHtml` 对应的 component tree
- GrapesJS 管理可编辑 CSS
- React UI 管理 visual canvas、toolbar、right workspace、save/discard，以及必要时的内部 fallback

#### 保存时

1. `editor.getHtml()` 取回 body 级 HTML
2. `editor.getCss()` 取回编辑后 CSS
3. adapter 把它们重新塞回 `documentShell`
4. 生成新的完整 handbook HTML
5. 继续走现有 `PATCH /api/sessions/[id]/handbooks/[handbookId]`

这个边界可以最大程度保持：

- 存储契约不变
- publish / preview 路径不变
- provenance 逻辑不变
- 内部 source fallback 能力不变，但不作为 2.0 的用户常规编辑入口暴露

### 4.3 ZA6gt 原型映射到工程职责

基于 `pencil-demo.pen` 中 `ZA6gt` 以及其关联节点，可以把职责拆得很清楚：

- `ZA6gt`
  - 整体“编辑态工作台”
- `LsSX3`
  - 右侧 `Assistant / Spots / Remix` 容器
  - 应由 React 实现，不应依赖 GrapesJS 默认 panel
- `aTjVS`
  - `Spots` tab 的专用工作区
  - 与 GrapesJS 是联动关系，不是 GrapesJS 原生能力
- `KREOj`
  - 文本级工具条
  - 建议挂在 GrapesJS 的 text selection / RTE 生命周期上
- `saEP6`
  - 组件/区块级工具条
  - 建议挂在 GrapesJS 的 selected component 生命周期上

因此在产品架构上应明确：

- 中间 canvas = GrapesJS
- 右侧 workspace = React 产品 UI
- 浮动 toolbar = React overlay + GrapesJS selection state

### 4.4 当前 rollout 只做手动编辑，AI 对话框后置

虽然原型 `LsSX3` 的下半部画了 AI composer / prompt 区，但当前 rollout 不应该把它当成功能范围。

本期应该明确：

- handbook 编辑由用户手动完成
- 右侧面板的核心是手动 style inspector / 属性编辑器
- `KREOj` / `saEP6` 也都是本地手动操作
- `Ai Commands` 只保留视觉占位或 disabled affordance，不接真实 agent 能力

下一阶段再做的事情：

- 基于 GrapesJS 官方 API 做一层内部 MCP
- 把 selected component、style target、asset picker、component command 等能力暴露给 Edit Agent
- 让 Edit Agent 能以“选区 + 组件树 + 命令边界”为单位修改 handbook

也就是说，路线应该是：

`先把 manual editing 打磨成稳定可用 -> 再把 GrapesJS API 封装成 MCP -> 最后接 Edit Agent`

### 4.5 本期手动编辑能力清单

结合 GrapesJS 官方文档与本地安装的 `grapesjs@0.22.14` 默认 Style Manager 配置，本期建议把手动编辑能力分成三层。

#### A. 右侧手动样式面板

这是 `LsSX3` 在本期最重要的职责。

推荐开放的手动属性如下：

- `Space`
  - `margin`
  - `padding`
  - 需要支持四边拆分：top / right / bottom / left

- `Typography`
  - `font-family`
  - `font-size`
  - `font-weight`
  - `font-style`
  - `color`
  - `line-height`
  - `letter-spacing`
  - `text-align`
  - `vertical-align`

- `Decoration`
  - `background-color`
  - `border-radius`
  - `border`
  - `box-shadow`

- `Size / Layout`
  - `width`
  - `height`
  - `max-width`
  - `min-height`
  - `display`

这里有两个要特别说清楚的点：

1. `margin` / `padding`、`font-family` / `font-size` / `font-weight` / `color` / `line-height` / `letter-spacing` / `text-align` 都和 GrapesJS 0.22.14 的默认 Style Manager 方向一致，可以直接沿用或轻改。
2. `font-style` 与 `vertical-align` 不在 GrapesJS 0.22.14 默认 `Typography` sector 的那组预置字段里，所以我们应该在自定义 Style Manager/React 面板里显式补上，而不是误以为默认 UI 自带。

#### B. 文本级手动工具条 `KREOj`

本期建议开放：

- `bold`
- `italic`
- `underline`
- `strike`
- `link`
- `color`
- `font size`

本期建议延后或仅做 disabled/placeholder：

- `image`
- `text style` 预设

原因是官方文档建议 RTE toolbar 保持轻量，把更复杂的样式调节交给 Style Manager。

#### C. 组件级手动工具条 `saEP6`

本期建议只开放安全、边界清楚的手动操作：

- `select parent`
- `duplicate`
- `delete`

可保留视觉占位但暂不接行为：

- `Ai Commands`
- `Move`
- `H1 / H2 / H3`
- `Color`
- `Size`

### 4.6 `vertical-align` 需要按 selection 类型条件显示

`vertical-align` 容易被误用，所以不建议对所有选区无差别显示。

推荐规则：

- 对文本节点、inline/inline-block 元素、table-cell 这类兼容目标才显示
- 对 section、flex container、普通 block 布局默认隐藏

原因是：

- 在很多 block/flex 场景里，`vertical-align` 不会产生用户预期的效果
- 对容器级对齐，后续更适合通过 layout/flex controls 处理，而不是把 `vertical-align` 当成万能按钮

## 5. 推荐方案与备选方案

### 方案 A：HTML adapter round-trip

这是推荐方案，也是主 rollout 最应该采用的方案。

做法：

- 保持 `Handbook.html` 作为唯一持久化 artifact
- visual mode 打开时把完整 handbook HTML 适配成 `bodyHtml + css`
- GrapesJS 只编辑 body/canvas
- 保存时重新拼回完整单文件 HTML

优点：

- 不改现有 save contract
- 不引入 Prisma/schema 新依赖
- 可视编辑与内部 fallback 都共享同一份最终 artifact
- publish/preview 几乎不需要重做

缺点：

- 需要认真处理 shell 提取与重建
- 对少量 head/script 语义要做保守处理
- round-trip 需要容忍 GrapesJS 的结构规范化

### 方案 B：单独持久化 GrapesJS project JSON

这是中长期可能更强的方案，但不建议放进当前 rollout。

做法：

- 新增 GrapesJS project data 持久化
- handbook HTML 只作为导出产物
- visual editor 的 source of truth 变成 GrapesJS project JSON

优点：

- 更符合 GrapesJS 原生项目模型
- 更容易做复杂 block/component 级编辑
- 对后续 AI block mutation 更友好

缺点：

- 会扩大 rollout 范围
- 需要额外持久化设计
- 会引入 migration、兼容性、同步策略问题

### 方案 C：继续以原始 HTML textarea/iframe 为主，只做轻量 DOM 操作

这个方案不推荐。

原因：

- 选区、组件树、样式管理都要自己造
- `KREOj` / `saEP6` 会变成脆弱的 iframe DOM 操作
- 和原型的结构化编辑方向相悖

## 6. 对主 rollout 计划的具体落地建议

### 6.1 文件职责建议

建议沿用主计划里已经列出的文件拆分，但把责任边界说得更硬一点：

- `src/app/session/[id]/_lib/handbook-html-adapter.ts`
  - 完整 handbook HTML <-> GrapesJS 输入/输出 的唯一边界
  - 负责提取 shell、body、css、meta，并负责重建完整文档

- `src/app/session/[id]/_hooks/use-grapesjs-editor.ts`
  - 动态加载 GrapesJS
  - 初始化/销毁 editor
  - 绑定 selection、dirty、RTE、asset/style custom hooks

- `src/app/session/[id]/_components/handbook-visual-editor.tsx`
  - 只负责 canvas host 和 editor lifecycle 承载
  - 不承担业务保存逻辑

- `src/app/session/[id]/_components/handbook-manual-editor.tsx`
  - 从“纯 textarea 编辑器”升级成 visual-first 壳
  - source fallback 只保留为内部异常路径，不作为用户常规入口

- `src/app/session/[id]/_lib/handbook-selection.ts`
  - 对外暴露统一 selection view-model
  - 让 `KREOj`、`saEP6`、右侧 panel 都吃同一套选区数据

### 6.2 文本工具条建议

`KREOj` 不建议直接照搬浏览器原生 `contenteditable` toolbar，而建议这样做：

- 依赖 GrapesJS text component 的选中/编辑态
- 先做最小动作集：
  - bold
  - italic
  - underline
  - strike
  - link
- `Color` / `Size` / `Text Style` 尽量走统一样式写回，而不是在 RTE 里塞过多富文本命令

原因是官方文档明确建议 RTE toolbar 保持精简，把复杂样式交给 Style Manager。

### 6.3 区块工具条建议

`saEP6` 第一阶段建议只做与 component model 强相关、且可安全映射的动作：

- select parent
- duplicate
- delete
- move

而这些动作都应以 selected component 为中心，通过 GrapesJS component API 或 command API 完成。

像 `H1/H2/H3`、AI commands、复杂结构变换，第一阶段只保留 hook，不要求全做完。

### 6.4 右侧工作区建议

`LsSX3` 不要尝试“把 GrapesJS 默认 panels 塞进去”，而是：

- 用 React 做 tabs 和业务布局
- 用 GrapesJS selection state 驱动内容
- 样式控制可以分两层：
  - 第一层：读 selected component 的常见 style/attributes
  - 第二层：必要时桥接到 `StyleManager` API

这样做的好处是：

- UI 可以更贴近 `ZA6gt`
- `Assistant` / `Spots` / `Remix` 可以共用同一侧栏框架
- 以后接入 agent 能力时不用推翻 UI 壳

## 7. 风险与回退策略

### 7.1 HTML round-trip 漂移

风险：

- GrapesJS 解析和导出后，HTML 结构可能与输入不完全字面一致
- 某些无效但浏览器可容忍的结构会被规范化

策略：

- adapter 对 shell 与 body 做边界隔离
- 只让 GrapesJS 管理真正要编辑的内容区
- 对无法安全 round-trip 的 handbook，进入 visual unavailable 状态，并保留内部 source fallback 处理能力

### 7.2 script / unsafe attrs 丢失

风险：

- GrapesJS Parser 默认不允许脚本与危险属性

策略：

- rollout 阶段优先把 handbook 视为静态内容 artifact
- 非编辑区脚本由 shell 保留，不进入 visual canvas
- 对 body 内复杂脚本节点先做不可编辑或 source-only 策略

### 7.3 样式作用域外溢

风险：

- GrapesJS 默认更偏向 class-based styling
- 修改共享 class 时可能影响多个块

策略：

- 初期限制右侧可编辑属性集合
- 对需要单组件生效的改动优先考虑 component-first 风格策略或局部 class 规范
- 避免第一阶段开放过宽的全量 CSS 编辑

### 7.4 UI 误判为“GrapesJS 自带”

风险：

- 团队容易把 `LsSX3`、`aTjVS`、`KREOj`、`saEP6` 当成“接入 GrapesJS 就自动有”

策略：

- 在计划与实现里明确区分：
  - GrapesJS engine
  - React workspace shell
  - custom toolbar overlays

## 8. 主文档应该从这里引入什么

主 rollout 计划建议把这份文档当成 GrapesJS 子方案附录，至少继承下面几个约束：

1. `Handbook.html` 仍是保存契约，GrapesJS project data 不是本期持久化真相。
2. 必须存在 `handbook-html-adapter`，不能让 UI 组件直接拼接完整文档壳。
3. `LsSX3` / `aTjVS` / `KREOj` / `saEP6` 都是 React 产品 UI，不是默认 GrapesJS 面板。
4. 内部 source fallback 必须始终可用，但不应作为 2.0 的默认用户交互暴露。
5. 保存成功后要把 visual editor 的导出结果重新落入现有 handbook PATCH 流程。

## 9. 官方资料

以下结论都来自 GrapesJS 官方文档或官方仓库：

- [GrapesJS 仓库 README](https://github.com/GrapesJS/grapesjs)
- [Component Manager](https://grapesjs.com/docs/modules/Components.html)
- [Parser API](https://grapesjs.com/docs/api/parser.html)
- [Editor API](https://grapesjs.com/docs/api/editor.html)
- [RichTextEditor API](https://grapesjs.com/docs/api/rich_text_editor.html)
- [Style Manager](https://grapesjs.com/docs/modules/Style-manager.html)
- [Asset Manager](https://grapesjs.com/docs/modules/Assets.html)
- [Getting Started](https://grapesjs.com/docs/getting-started.html)
