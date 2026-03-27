# Tabi 2.0 GrapesJS 与 Spots UI 接入说明

> 状态更新（2026-03-18）：
> 以 `docs/superpowers/specs/2026-03-18-tabi-2-0-editor-workspace-design.md` 和
> `docs/superpowers/plans/2026-03-18-tabi-2-0-editor-workspace-rollout.md` 为准。
>
> 当前有效 UI 口径：
> - 右侧 tab：`Edit / Spots / Remix`
> - 中间 handbook：完成后直接进入可视化编辑态（不是展示态/编辑态双模式）
> - 不再把 block/session 编辑模块作为 2.0 用户可见主流程

> 这份文档是 `docs/superpowers/plans/2026-03-17-tabi-2-0-unified-workspace-rollout.md` 的产品/UI 参考说明，不是并行执行计划。若执行顺序、范围或优先级有冲突，以 unified rollout plan 为准，并回写这里保持一致。

## 1. 这份文档解决什么问题

当前最小版 rollout 已经把 `Generation / Remix / Handbook-first / 手动保存 handbook HTML` 这条主链路铺通了，但还没有把原型图里两块明显的 UI 能力真正接进来：

- `LsSX3`
  - 右侧 `Assistant / Handbook Workspace`
  - 这里在原型里不是简单聊天框，而是一个和当前选区联动的编辑工作区

- `aTjVS`
  - 右侧 `Spots` 工作区
  - 这里在原型里不是弹窗，而是一个常驻 tab：上半部 mini map，下半部 CSV-ready spots 列表

另外，当前最小版虽然已经有 `HTML split editor + live preview`，但还没有真正进入原型里预期的可视化 handbook 编辑形态，所以需要单独把 `GrapesJS` 的接入边界讲清楚。

这份文档的目标是：

1. 说明为什么当前最小版没有直接做成原型图里的完整 UI。
2. 确认本仓库已经具备的 `GrapesJS` / Google Maps 依赖能力。
3. 定义原型节点 `LsSX3`、`aTjVS`、`KREOj`、`saEP6` 在产品和工程上的真实职责。
4. 给出下一步 UI 接入方案，但先不要求 `Edit Agent` 一起落地。

---

## 2. 当前仓库现状

### 2.1 已经存在的基础

- 已安装 `grapesjs@0.22.14`
- 已安装 `@react-google-maps/api`
- 已存在 `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- 已有 handbook 保存链路：
  - `PATCH /api/sessions/[id]/handbooks/[handbookId]`
- 已有 spots CSV 构造逻辑：
  - `buildGoogleMapsCsv(...)`
  - `buildGoogleMapsDirectionsUrl(...)`
- 已有最小版手动编辑器：
  - `src/app/session/[id]/_components/handbook-manual-editor.tsx`
- 已有 CSV 弹窗：
  - `src/components/csv-export-guide-dialog.tsx`

### 2.2 为什么当前最小版没有直接做成原型

这是一个刻意的取舍，不是忽略了原型。

当前最小版优先完成的是：

- 让 handbook 成为 session 的主产物
- 让 remix 真正变成“新 handbook artifact”
- 让 handbook HTML 可以被手动改动并持久化
- 保住现有 `SessionState.blocks / spotBlocks / toolOutputs` 的兼容层

所以它先选了：

- handbook 编辑：`HTML textarea + preview`
- spots 导出：`CSV 弹窗`

而没有一步到位上：

- `GrapesJS` 的可视化编辑壳
- 右侧常驻 `Spots` tab
- 浮动文本工具条 / 组件工具条

这不是方向错误，而是先把“数据与保存链路”跑通，再补“原型级 UI”。

---

## 3. 先说清楚 GrapesJS 是什么

### 3.1 我们当前项目里装的是哪一种

当前项目本地安装的是开源版 `grapesjs`，不是官方商业化的 `Studio SDK`。

本地包里能确认到的事实：

- 包名：`grapesjs`
- 版本：`0.22.14`
- 可直接使用 `grapesjs.init(...)`
- 支持：
  - `editor.setComponents(...)`
  - `editor.getHtml()`
  - `editor.getCss()`
  - `editor.on('component:select', ...)`
  - `component.setStyle(...)`

这意味着：

- 我们现在可以直接把开源 GrapesJS 嵌进页面
- 但右侧原型里那套 `Assistant / Style Console / Spots / Remix` 壳，需要我们自己用 React 做
- 不能把“引入 GrapesJS”理解为“自动获得整套 Studio 原型 UI”

### 3.2 对我们来说，GrapesJS 应该扮演什么角色

在 Tabi 2.0 里，GrapesJS 只应该负责：

- 中间 handbook canvas 的可视化编辑
- DOM/component 选区管理
- 基础样式改动能力
- 导出当前编辑结果

GrapesJS 不应该负责：

- 右侧产品工作区整体布局
- spots 面板
- remix 面板
- session / handbook 列表
- agent 编排

一句话：

`GrapesJS 是 center canvas editor engine，不是整个 Studio 壳。`

---

## 4. 原型节点的真实含义

## 4.1 `LsSX3` 是什么

`LsSX3` 在原型里是右侧 `Handbook Workspace / Assistant` 面板。

它不是“GrapesJS 默认样式面板”，而是我们自己的产品面板。原型里它由三部分组成：

- header
  - `Handbook Workspace`
  - 当前状态文案，例如 `Flow in progress · generating handbook`

- tabs
  - `Assistant`
  - `Spots`
  - `Remix`

- body
  - 上半部是一个 `selection-aware` 的 style console
  - 下半部在原型里是一个 AI composer / prompt 输入区

这意味着在工程上：

- `LsSX3` 应该继续由 React 自己渲染
- 不应该直接复用 GrapesJS 默认 `StyleManager` UI
- 但它的输入源应该来自 GrapesJS 当前选中的 component

对当前 rollout 还要补一条非常关键的限制：

- 本期先做 **manual editing**
- 不实现真正可提交的 AI 对话框
- 如果要保留原型下半部形态，也只做 disabled placeholder / future hook

也就是说：

- 右侧面板是我们自己的 UI
- 选中什么，由 GrapesJS 告诉我们
- 改什么，由我们调用 GrapesJS component API

### 4.2 `aTjVS` 是什么

`aTjVS` 是右侧 `Spots` tab 的完整形态。

它在原型里不是一个二级弹窗，而是一个常驻工作区，包含：

- `Spots Mini Map (Google-style)`
- `Open Maps`
- `Download CSV`
- `CSV Spots Data`
- 按视频出现顺序排序的 spots 列表

这说明产品上的期望非常明确：

- CSV 导出不应该只在用户点击按钮后弹一个说明框
- spots 应该成为右侧 workspace 的一等公民
- 用户要在当前编辑态直接看到：
  - 地图
  - spots 卡片
  - CSV 导出入口

### 4.3 `KREOj` 是什么

`KREOj` 是文本选区出现后的浮动 `Text Toolbar`。

原型里可以看到它包含：

- `Bold`
- `Italic`
- `Underline`
- `Strike`
- `Image`
- `Link`
- `Text Style`
- `Color`
- `Size`

它的语义非常清楚：

- 这是一个 **文本级** 工具条
- 只有在 handbook canvas 里选中了可编辑文本，或至少选中了文本 component 时，才应该出现

在 Tabi 2.0 中，它应该对应：

- 手动编辑模式下的本地操作
- 暂时不依赖 `Edit Agent`
- 后续再把 agent 操作接在同一套选区语义上

### 4.4 `saEP6` 是什么

`saEP6` 在原型里叫 `Block Toolbar`，但更准确地说，它是一个 **组件 / 区块级上下文工具条**。

从原型看，它包含：

- `Ai Commands`
- `Select Parent`
- `Move`
- `Duplicate`
- `Delete`
- `H1 / H2 / H3`
- `Color`
- `Size`

其中一部分按钮在原型截图里是 disabled，这个信息很重要：

- `saEP6` 不是始终对所有选区都完整开放
- 它会根据当前选中的 component 类型，动态决定哪些动作可用

推荐的产品解释是：

- `KREOj`
  - 文本选区工具条
  - 偏 inline formatting

- `saEP6`
  - 组件/section 级工具条
  - 偏结构级操作和 AI 入口

换句话说：

- `KREOj` 处理“这段字怎么改”
- `saEP6` 处理“这个块怎么改”

---

## 5. GrapesJS 在我们这里应该怎么接

## 5.1 接入方式

推荐使用 `client-only` 封装组件，不在 server 侧直接 import。

原因：

- GrapesJS 依赖浏览器 DOM
- handbook 编辑器只应该在进入视觉编辑模式后初始化
- 避免把编辑器脚本放进普通预览路径

推荐形态：

- 新建一个 `HandbookVisualEditor` 组件
- 在组件内部动态加载 `grapesjs`
- 初始化时传入当前 active handbook HTML
- 组件卸载时 `editor.destroy()`

### 5.2 最小可行初始化原则

Tabi 不应该先上 GrapesJS 默认后台风格 UI。

初始化建议：

- 关闭默认 storage manager
- 关闭默认 panels / blocks 等不需要的面板

### 5.3 本期要明确交付的手动编辑属性

当前 rollout 建议把右侧工作区中的手动样式编辑收敛到下面这组属性：

- `Space`
  - `margin`
  - `padding`

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

需要特别注意：

- GrapesJS 0.22.14 默认 `Typography` 预置里有 `font-family`、`font-size`、`font-weight`、`letter-spacing`、`color`、`line-height`、`text-align`
- 但 `font-style` 和 `vertical-align` 需要我们在自定义面板里显式补上
- `vertical-align` 只应该对兼容的 text/inline/table-cell 目标显示，不应对所有 block/section 暴露
- 只保留 canvas 和 selection 能力
- 让右侧 `LsSX3` 继续作为我们的自定义控制面板

也就是：

- GrapesJS 提供中间画布
- React 提供右侧工作区

### 5.3 handbook HTML 怎么喂给 GrapesJS

这里有一个关键问题：

当前 `Handbook.html` 存的是单文件 HTML，而 GrapesJS 更偏向：

- `components`
- `style`

所以中间需要一个适配层。

推荐方案：

1. 读取当前 `Handbook.html`
2. 解析出：
   - body 里的内容
   - style 标签里的 CSS
3. 初始化 GrapesJS：
   - `components = bodyHtml`
   - `style = extractedCss`
4. 保存时重新导出：
   - `editor.getHtml()`
   - `editor.getCss()`
5. 再重新包回 Tabi 的单文件 handbook HTML shell

这个适配层很重要，因为否则我们会遇到两个问题：

- GrapesJS 只拿到碎片 HTML
- handbook 保存后失去原来需要的完整页面结构

### 5.4 handbook 里的稳定 id 怎么办

如果未来还要做 `Edit Agent`，我们不能只依赖裸 DOM。

推荐从现在开始就给 handbook 的可编辑块保留稳定锚点，例如：

- `id`
- `data-tabi-node-id`
- `data-tabi-section-id`

用途有三个：

1. 右侧工作区知道当前选中了哪个 section
2. `KREOj / saEP6` 可以定位到对应 component
3. 未来 `Edit Agent` 可以把“改这里”映射到稳定目标

如果没有这一层，后续所有 component-level MCP 都会变脆弱。

### 5.5 不接 Edit Agent 时，用户在编辑框里怎么操作

先不接 agent，也完全可以做出第一版视觉编辑。

建议交互：

1. 用户在 center canvas 里点击 `Edit`
2. 中间预览 iframe 切换为 `GrapesJS canvas`
3. 右侧仍显示 `LsSX3`
4. 选中 component 后：
   - 右侧显示当前 component 的基础属性
   - 文本选中时弹出 `KREOj`
   - section 选中时弹出 `saEP6`
5. 用户完成修改后：
   - 点击 `Save`
   - 序列化当前 GrapesJS 内容
   - PATCH 回 `Handbook.html`

第一版支持的本地能力建议只做：

- 改文本
- 改字号
- 改颜色
- 改链接
- 替换图片
- 删除 section
- duplicate section

先不做：

- AI 改写
- component tree MCP
- 跨 section 复杂结构编辑

---

## 6. `KREOj` 和 `saEP6` 应该怎样映射到工程实现

## 6.1 `KREOj` 建议先做

`KREOj` 比 `saEP6` 更适合作为第一步，因为它更聚焦，更容易和“普通手动编辑”对齐。

建议第一版职责：

- 当选中文本 component，或进入文本编辑态时显示
- 控制：
  - bold
  - italic
  - underline
  - strike
  - link
  - text preset
  - color
  - font size

第一版可以不完全依赖浏览器原生 `selection range`，而是先做成：

- 当前选中文本 component 的样式工具条

这样实现更稳：

- 不需要立刻处理复杂 RTE 选区同步
- 但用户依然能感知到“这是文本工具条”

### 6.2 `saEP6` 应该后做

`saEP6` 更适合放在第二阶段，因为它天然牵涉：

- 组件层级
- 选中父节点
- 拖动 / reorder
- duplicate
- delete
- AI commands

它更接近“结构编辑”和“未来 agent hook”。

推荐第一阶段只保留：

- `Duplicate`
- `Delete`
- `Select Parent`

先不做：

- `Ai Commands`
- heading 快捷转换
- 复杂 move 手势

否则会很快把最小版的编辑器拖进“半成品编辑器平台”。

---

## 7. `aTjVS` 的 Spots / Map / CSV 应该怎么接

## 7.1 当前仓库已经有一半了

当前仓库实际上已经有了 spots 的核心数据能力：

- 可以从 editor output 生成 CSV
- 可以生成 Open Maps URL
- 可以下载 CSV

缺的不是数据，而是 UI 载体。

目前是：

- `CSV 弹窗`

目标应该变成：

- `aTjVS` 常驻右侧 `Spots` tab

### 7.2 第一版不需要新后端

第一版 `aTjVS` 可以不引入新后端接口，直接复用现有数据来源。

推荐优先级：

1. 当前 editor session 的 `spot_blocks`
2. active handbook 的 `sourceSpotBlocks`
3. session state 的 `spotBlocks`

这样可以先把 UI 做出来，而不必等“最终 handbook 内容重新反解析地点”这一层。

### 7.3 地图怎么接

项目里已经有：

- `@react-google-maps/api`
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`

所以可以直接做 `SpotsMiniMap` 组件，基本结构：

- `useJsApiLoader(...)`
- `<GoogleMap />`
- `<Marker />`

地图第一版只需要做：

- 根据 spots 坐标打 marker
- auto fit bounds
- 点击 row 时高亮对应 marker

先不做：

- route polyline
- clustering
- info window 富交互
- 手动拖点改坐标

### 7.4 `aTjVS` 的 UI 结构建议

右侧 `Spots` tab 建议拆成两个 React 组件：

- `SpotsMiniMapPanel`
  - 对应原型上半区
  - 标题 + map

- `SpotsCsvPanel`
  - 对应原型下半区
  - `Open Maps`
  - `Download CSV`
  - `CSV Spots Data`
  - 按顺序排列的 row 列表

这两个组件可以共用一个统一的 `spots view model`：

- `rows`
- `mapMarkers`
- `openMapsUrl`
- `csvContent`
- `fileName`

### 7.5 原型上 `Open Maps / Download CSV` 的意义

这两个按钮应该从“导出弹窗的一次性动作”升级成“workspace 常驻能力”。

推荐行为：

- `Open Maps`
  - 直接打开已有 URL

- `Download CSV`
  - 直接下载，不必先弹说明框

如果要保留说明，可以：

- 放一个小型 tooltip / help text
- 不要再用 modal 作为主入口

因为原型 `aTjVS` 的重点是：

`地图与 CSV 现在就是编辑态的一部分，而不是导出后的附属流程。`

---

## 8. 推荐的下一步实现顺序

## Phase A：把编辑壳从 split editor 升级成 visual editor

目标：

- 保留当前 handbook 保存链路
- 但把中间编辑面板改成 `GrapesJS canvas`

建议改动点：

- 新建 `src/app/session/[id]/_components/handbook-visual-editor.tsx`
- 新建 `src/app/session/[id]/_lib/handbook-html-adapter.ts`
- `handbook-manual-editor.tsx` 变成：
  - source 模式
  - visual 模式

## Phase B：把 `aTjVS` 真正接进右侧 tab

目标：

- 不再只弹 CSV modal
- 右侧常驻 `Spots` tab

建议改动点：

- 新建 `src/app/session/[id]/_components/session-spots-panel.tsx`
- 新建 `src/app/session/[id]/_components/spots-mini-map.tsx`
- 把现有 CSV 导出逻辑从 dialog 驱动改成 panel 驱动

## Phase C：先落 `KREOj`

目标：

- 文本选区出现浮动工具条
- 不接 agent，先做本地样式修改

建议改动点：

- 新建 `src/app/session/[id]/_components/handbook-text-toolbar.tsx`
- 在 GrapesJS selection / text editing 事件上挂载

## Phase D：最后再考虑 `saEP6`

目标：

- 组件级上下文操作
- 为未来 Edit Agent 留清楚接口

建议改动点：

- 新建 `src/app/session/[id]/_components/handbook-block-toolbar.tsx`
- 只先支持 duplicate / delete / select parent

---

## 9. 对当前计划的修正建议

当前最小版计划没有错，但它漏掉了一层表达：

- 它解决了“数据与保存链路”
- 还没有覆盖“原型级编辑 UI 与 spots workspace”

所以后续文档和计划里应该明确把这部分单列成新的 UI 实施块，而不是继续隐含在“manual handbook editing”里。

更准确的分法应该是：

1. `Manual handbook save path`
   - 已完成第一版

2. `Visual handbook editing shell (GrapesJS-backed)`
   - 待实现

3. `Spots workspace tab (map + CSV list)`
   - 待实现

4. `Floating contextual toolbars`
   - `KREOj` 先做
   - `saEP6` 后做

5. `Editor Agent + MCP`
   - 明确后续版本

---

## 10. 最终结论

结论非常明确：

- 原型图里的 `LsSX3` 和 `aTjVS` 确实是新的 UI 层内容，不能只靠当前最小版的 split editor / CSV dialog 代表已经覆盖。
- 当前项目已经具备接入它们的基础依赖：
  - `grapesjs`
  - `@react-google-maps/api`
  - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- 现在最合理的做法不是直接做 `Edit Agent`，而是先把：
  - `GrapesJS 视觉编辑壳`
  - `Spots 常驻 tab`
  - `KREOj` 文本工具条
  这三层做出来。

其中最重要的一条判断是：

`GrapesJS 负责中间 canvas，不负责右侧 Studio 壳；右侧工作区仍然应该由我们自己的 React UI 控制。`

而 `KREOj` / `saEP6` 的职责应该明确区分：

- `KREOj`
  - 文本级工具条
  - 适合先做

- `saEP6`
  - 组件级工具条
  - 更适合放到下一阶段，并为 future Edit Agent 留接口
