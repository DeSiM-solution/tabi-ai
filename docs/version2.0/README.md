# Tabi 产品 2.0 方案

## 1. 产品定义

### 1.1 一句话定义
Tabi 2.0 不再是一个 `video -> block -> HTML` 生成器，而是一个真正的 `AI 旅行手册创作工作台`：

- 用户导入 YouTube 视频或其他旅行素材
- 系统先完成爬取、分析与结构化存储
- AI 生成一个可继续编辑的 handbook
- 系统同时产出与 handbook 对齐的 spots 数据
- 用户在同一个 session 中继续编辑、导出、remix 不同风格版本

### 1.2 2.0 的最终产物
2.0 的核心不是让用户看到中间结构，而是稳定产出两个真正可用的结果：

1. `Handbook HTML`
   - 这是主产物
   - 最终会被整理成可二次编辑的 GrapeJS Component 形态
   - 用户围绕它进行可视化编辑、AI 编辑与风格 remix

2. `Spots Data`
   - 如果最终 handbook 内容里提到了地点，系统要把这些地点沉淀出来
   - 用户可以在右侧 `Spots` 工作区查看
   - 用户可以导出成可用于 Google Maps 的 CSV

### 1.3 为什么必须做 2.0
当前 1.x 更像一个偏内部的流程工具，而不是成熟的创作型产品：

- `block` 心智更适合系统实现，不适合用户主流程
- 用户真正想编辑的是最终网页，而不是中间语义块
- 右侧区域过多暴露 tool / system 输出，而不是产品价值
- handbook 版本与 block 结构把产品叙事带偏了
- 生成完成后，用户缺少围绕同一份成果持续打磨、重混和再表达的顺滑体验

2.0 要把产品重心改成：

- `session-backed`
- `handbook-first`
- `spots-aware`
- `remix-ready`

## 2. 产品目标

### 2.1 核心目标

- “把一个公开视频快速变成一个可发布、可编辑的旅行手册。”
- “让我直接围绕成品 handbook 修改，而不是处理中间数据。”
- “我希望系统不仅生成页面，还能把其中提到的地点整理出来。”
- “我希望同一份 session 数据可以反复 remix 成不同风格，而不用反复重跑整个链路。”

### 2.2 情绪层目标

- “我在主导一个作品，而不是在对着系统结构做配置。”
- “我能明确知道系统现在处理到哪一步了。”
- “我可以放心尝试不同风格，因为底层数据已经存好了，不需要反复从零开始。”
- “地点与地图是可用成果，不只是后台分析副产物。”

## 3. 核心对象模型

2.0 面向用户的核心对象应该是：

- `Session`
  - 一个 handbook 项目
  - 承载来源数据、分析结果、当前 handbook、spots 数据和 remix 上下文

- `Handbook`
  - 当前 session 的主编辑产物
  - 本质是可继续编辑的 HTML / Component 结果

- `Spots`
  - 与当前 handbook 对齐的地点数据集
  - 既服务于产品内查看，也服务于 Google Maps CSV 导出

- `Remix`
  - 基于当前 session 已存储数据，生成新的 handbook 表达版本
  - 用户每次都可以选择不同风格

- `Assistant`
  - 面向选中区域或整页 handbook 的 AI 协作入口

要明确替换掉的旧心智是：

- `block editor`
- `parse block`
- `tool outputs 作为主界面内容`
- `用户直接感知 handbook versions`

## 4. Agent 执行模型

2.0 不应该把所有智能能力都塞进同一个长期运行的助手里，而应该拆成三个职责清晰的 agent 入口。

### 4.1 Generation Agent

- 负责 `YouTube / Apify -> session data -> analysis jobs -> handbook HTML`
- 它处理首次生成链路
- 当第一版 handbook HTML 产出后，这个任务就算完成
- spots、分析结果和来源材料沉淀到 session，供后续界面和其他 agent 继续使用

### 4.2 Remix Agent

- 负责基于 `已存 session data + 用户选择的 style` 再生成 handbook HTML
- 它不重新跑原始爬取流程
- 它的任务目标不是“再生成一份差不多的页面”，而是基于相同事实层生成明显不同的表达版本

### 4.3 Editor Agent

- 它不是常驻 agent
- 每次用户选中某个 handbook 区块并发起一次具体修改时，才临时启动一个任务型 agent
- 它围绕 GrapesJS Component Tree 工作
- 每个 component 都有稳定 id，可作为编辑目标
- 它通过后续逐步补齐的 MCP 能力执行操作，例如 `component.setStyle()` 等

### 4.4 当前版本的产品取舍

- `Generation Agent` 和 `Remix Agent` 属于当前版本核心能力
- `Editor Agent` 是明确的后续方向，但实现会更复杂，需要逐步接入
- 当前版本必须先把 `普通手动编辑` 做完整，让用户在不依赖 editor agent 的情况下也能完成 handbook 调整

## 5. 核心流程

### 5.1 2.0 的真实生成链路

2.0 的核心链路应该改成：

1. 用户输入 YouTube URL，或进入已有 session
2. 系统通过 `Apify` 等方式爬取视频及相关页面数据
3. 将爬取结果和原始分析材料写入当前 session
4. 基于 session 中的原始数据，运行多个分析工序 / tools
   - 例如：视频理解、地点提取、地点解析、路线判断、素材筛选、段落规划
5. 系统生成两个对用户有价值的产物
   - `a. handbook HTML`
   - `b. spots dataset / Google Maps CSV`
6. 用户进入 Studio，围绕当前 handbook 继续编辑、校对 spots、选择 remix 风格

这一段主要由 `Generation Agent` 负责执行，直到 handbook HTML 首次产出为止。

### 5.2 一个关键变化
2.0 的中间层依然可以存在，但它不应该再是标准 `Block` 格式，也不应该成为用户可见主流程。

产品判断：

- 当前 session 中会保存一套内部数据结构
- 这套数据结构可以支持后续继续生成、局部编辑、spots 对齐和 remix
- 但它不需要长成今天的标准 Block
- 用户也不应该被迫理解或直接操作它

一句话说：

`对系统保留内部语义层，对用户隐藏 block 心智。`

## 6. 生成中体验

### 6.1 与原型一致的总体原则
生成中的整体 UI 不需要推翻重来，和原型图里 `rLNTk` 一样，应该保持：

- 左侧是 session / handbook 列表
- 中间是 handbook 预览位
- 右侧是 Handbook Workspace

也就是说：

- `外壳不变`
- `处理中步骤变了`

### 6.2 生成中不再出现的旧步骤
以下旧心智应该从 README 里移除：

- 解析 block
- block ready
- 用户围绕 block 进入主编辑

2.0 不再强调 `block parsing`，而是强调 `session-backed analysis`。

### 6.3 推荐的生成中阶段
右侧 Workspace 可以继续显示 flow progress，但内部步骤应改成更贴近真实系统的阶段：

1. `Source crawling`
   - 通过 Apify 等渠道抓取视频与相关来源信息

2. `Session saving`
   - 将原始来源数据、元信息和中间分析材料存入当前 session

3. `Analysis jobs running`
   - 多个 tool / job 并行或串行工作
   - 例如地点提取、地名消歧、路线理解、画面理解、素材挑选、章节规划

4. `Draft handbook building`
   - 基于当前 session 数据生成第一版 handbook HTML

5. `Spots preparing`
   - 生成与当前输出内容对齐的地点列表、地图数据和 CSV 导出结果

### 6.4 Loading 态的产品原则

- Loading 态展示的是 `flow progress`，不是 block 构造过程
- 中间预览区在 draft handbook 未可用前可以保持 loading
- 一旦 draft handbook 可用，就尽快切换到可编辑工作台
- 右侧可以继续显示工具执行卡片，但这些卡片服务于“让用户知道系统正在做什么”，而不是暴露内部实现细节

## 7. 编辑态 Studio

### 7.1 编辑态主布局
和原型图 `ZA6gt` 一致，编辑态应该是一个稳定的三栏工作台：

1. `Left Session Rail`
   - session / handbook 列表
   - 当前项目入口

2. `Center Handbook Canvas`
   - handbook 的浏览器式预览区
   - 用户真正编辑和预览的是 handbook 本身

3. `Right Handbook Workspace`
   - 当前选中区域相关的属性、AI、spots、remix 能力

### 7.2 中间主画布的定位
中间区域展示的不是抽象 JSON，也不是 block list，而是 handbook 页面本身：

- 有浏览器式容器
- 有真实内容排版
- 有图片、标题、段落、地点坐标、标签等最终网页内容
- 用户编辑的是“结果页”，不是中间结构

这也是 2.0 最重要的产品转向：

`page-first` 进一步落成 `handbook-first`。

### 7.3 右侧 Handbook Workspace
根据当前原型，右侧工作区应收敛为三个主 tab：

1. `Assistant`
   - 默认工作区
   - 包含选中区域相关的属性检查器 / style console
   - 底部包含 AI composer
   - 用户可以针对选中的文本或区域发出编辑指令

2. `Spots`
   - 展示与当前 handbook 对齐的地点集合
   - 包含 mini map、地点列表、Open Maps、Download CSV
   - 这是地点能力的主承载入口

3. `Remix`
   - 让用户为当前 handbook 选择不同风格
   - 用户可选择 preset，并重新生成新的 handbook 表达版本

这比旧 README 里的 `Places / Style / Assets` 更贴近当前 2.0 原型。

### 7.4 Assistant 的真实定位
Assistant 不应该只是聊天面板。

在当前原型里，它更像：

- `selection-aware inspector`
- `AI composer`
- `局部编辑控制台`

所以产品表达上应避免写成“右侧是聊天区域”，更准确的说法是：

`右侧是一个会根据当前选中内容变化的 handbook workspace。`

### 7.5 当前版本先完成手动编辑
虽然 `LsSX3` 这块未来可以接入 `Editor Agent + GrapesJS MCP` 的编辑链路，但当前版本的优先级应该是：

- 先把普通手动编辑做好
- 让用户不依赖 agent 也能改文字、排版、样式和结构
- 把 Inspector / Style Console 先打磨成可用工具

后续版本再逐步把 `Editor Agent` 接到这块工作区上，去处理更复杂的局部 AI 操作。

### 7.6 LsSX3 与 Editor Agent 的关系
`LsSX3` 对应的不是一个传统聊天框，而是未来 `Editor Agent` 的任务入口。

推荐的产品理解是：

- 用户先在 handbook 中选中某个 component
- 右侧展示这个 component 的属性、样式和上下文
- 用户做普通修改时，走手动编辑能力
- 用户发出复杂修改意图时，未来可以临时启动一个 `Editor Agent`
- 该 agent 通过 GrapesJS Component Tree 的节点 id 和 MCP 能力去执行细粒度变更

## 8. Spots 能力

### 8.1 Spots 是一等能力，不是副产物
`aTjVS` 说明 2.0 里的地点能力不只是内部分析结果，而是用户可直接消费的成果。

Spots 工作区至少包含：

- `Mini Map`
- `地点列表`
- `Open Maps`
- `Download CSV`

### 8.2 Spots 的来源原则
Spots 不能只是“视频里疑似出现过的地点列表”，而应该优先与当前 handbook 对齐。

推荐原则：

- session 分析结果提供候选地点池
- 当前 handbook 内容决定最终要呈现和导出的 spots
- 如果某个地点已经进入当前 handbook 的叙事，它就应该进入 spots 汇总

也就是说：

`spots export 应该服务于当前成品，而不是服务于原始爬取日志。`

### 8.3 Spots 的导出目标
Spots 最终至少要支持导出成适合 Google Maps 使用的 CSV。

建议导出字段可包含：

- 地点名
- 纬度 / 经度
- 标签
- 简短说明
- 在视频或 handbook 中的出现顺序
- 可选的来源锚点

原型里已经体现了一个重要排序心智：

- `按视频出现顺序排序`

这个排序逻辑应该保留。

## 9. Remix 模型

### 9.1 Remix 的前提
Remix 的基础不是 block，而是当前 session 已保存的内部数据。

这意味着用户可以：

- 不重新爬视频
- 不重新走原始 ingest 流程
- 基于当前 session 里已存的来源和分析结果
- 直接尝试新的 handbook 风格

这条链路主要由 `Remix Agent` 执行。

### 9.2 Remix 的产物
Remix 的目标是生成 `新的 handbook 表达版本`，而不是只换皮肤。

它应该可以改变：

- 文案语气
- 页面视觉节奏
- 段落组织方式
- 图片与文本的编排风格
- 地点强调方式

但通常不应该丢掉：

- 这份 session 的来源事实基础
- 已确认的 spots 信息
- 当前 handbook 已沉淀出的主要叙事内容

### 9.3 Remix 不能每次都长得差不多
如果 remix 产出的东西和“新建一个 handbook”或者“上一次 remix”几乎一样，用户会很快觉得 remix 没有意义。

因此在 session 存储阶段就要为 remix 留出足够的表达空间，而不是只保存一份被压平的结果。

推荐做法：

- 保存 `事实层`，但不要过早把叙事完全锁死
- 保留多个可重组的章节候选、地点重点、素材候选和文案角度
- 把风格无关的语义理解和风格相关的表达决策拆开
- 让 Remix Agent 在相同来源事实下，仍然有足够大的版式和叙事搜索空间

一句话说：

`session data 不应只够“复刻同一份页面”，而要足够支持“重新表达同一份旅行内容”。`

### 9.4 Remix 的交互
根据 `ZBDSt`，Remix 工作区当前更接近 `style presets + remix action`：

- Minimal Tokyo
- Warm Analog
- Brutalist
- Dreamy Soft
- Let Tabi decide

并且支持：

- 将某个风格设为 session default
- 基于所选风格重新生成 handbook

这比旧 README 中单独的 `Style` tab 更准确。

## 10. 编辑模型

### 10.1 主要编辑方式
2.0 的主编辑方式应该收敛成三类：

1. `Visual edit`
   - 直接围绕 handbook 页面进行编辑

2. `AI edit`
   - 当前版本可以先聚焦普通手动编辑
   - 后续版本再逐步把针对选中区域的 agent 编辑接进来

3. `Remix`
   - 基于当前 session 数据重生成新的 handbook 版本

### 10.2 当前版本的编辑优先级
当前版本应明确优先：

- 让用户完成普通手动编辑
- 让画布、选区、样式控制和基础内容改动顺畅可用
- 不把 editor agent 作为本版是否可用的前提

`Editor Agent` 应被视为后续增强能力，而不是当前版本的交付阻塞项。

### 10.3 不建议再把 code edit 作为主叙事
旧 README 里有 `Code edit` 叙事，但在当前 2.0 原型和目标里，它不应是主路径。

更准确的说法是：

- 产品主流程是 handbook 可视化编辑与 AI 编辑
- 底层产物会落成 HTML / GrapeJS Component，可供后续二次编辑
- 但不应该让“用户直接写 HTML/CSS”成为 2.0 核心叙事

## 11. 数据对象方向

### 11.1 Session 内建议保存的对象
从产品和系统结合的角度，当前 session 建议承载这些对象：

- `source package`
  - Apify 爬取结果
  - 视频 / 页面元信息
  - 可追溯原始材料

- `analysis artifacts`
  - 视频理解结果
  - 地点提取和地点解析结果
  - 路线、章节、素材等分析结果
  - 供 remix 重组使用的多种候选表达材料

- `handbook document`
  - 当前主 handbook HTML
  - 未来会适配到 GrapeJS Component 体系

- `spots dataset`
  - 当前 handbook 对齐的地点集合
  - 可供地图展示与 CSV 导出

- `remix metadata`
  - 当前风格
  - 风格默认值
  - remix 历史或可恢复上下文
  - 为避免输出趋同所需的表达控制信息

- `checkpoints`
  - 用于高风险 AI 操作前后的恢复

### 11.2 重要约束

- 不要求这些对象拼成现有标准 Block
- 但必须足够支持后续继续生成、局部编辑、spots 汇总和 remix
- 用户感知到的是一个 `session + handbook`
- 而不是一个 `数据流程快照`

### 11.3 为 Remix 预留表达空间
如果 session 里只保存一份已经压平的最终 outline、固定图片选择和单一路径文案，那么后面的 remix 基本只会得到“同一页的轻微变体”。

因此 session 数据应该尽量保留：

- 来源事实
- 多个章节候选
- 多个地点重点和排序可能
- 不同语气 / 结构的表达空间
- 可被重新选择的素材与段落组织信息

这样 `Generation Agent` 和 `Remix Agent` 看起来才是两个不同入口，而不是同一套结果的重复渲染。

## 12. 产品原则

1. `Handbook-first`
   - 主画布永远是 handbook 本身

2. `Session-backed`
   - 一切后续生成和 remix 都基于 session 已存数据，而不是重复 ingest

3. `Spots-aware`
   - 地点能力必须成为可见成果，不是后台附属信息

4. `Hide blocks, keep semantics`
   - UI 层去掉 block
   - 系统层保留必要语义结构

5. `Fast to draft, safe to remix`
   - 尽快给出可编辑 draft
   - 用户可以放心切换风格并恢复

6. `Manual-first editing`
   - 当前版本先把普通手动编辑做好
   - agent 编辑是后续增强，而不是前置依赖

## 13. 关键风险

### 13.1 内部数据结构失控
如果去掉 block 后没有替代性的内部结构约束，后续 remix、spots 对齐、局部 AI 编辑都会变脆弱。

缓解方案：

- 设计新的 session 内部 schema
- 明确 handbook、spots、analysis artifacts 之间的关联
- 不对用户暴露 schema，但要对系统严格约束

### 13.2 Spots 与 handbook 脱节
如果 spots 只来自原始视频分析，而不与当前 handbook 对齐，地图和 CSV 会失去产品价值。

缓解方案：

- 以当前 handbook 为导出基准
- 对 spots 做“候选池 -> 最终选用集”的分层

### 13.3 Remix 输出高度趋同
如果 remix 每次都只是在同一版页面上做很轻微的变化，用户会很快觉得“新建”和“remix”都没有价值。

缓解方案：

- session 数据里保留更丰富的可重组材料
- 将事实层与表达层拆开存储
- 让 Remix Agent 有真实的重组空间，而不是只换样式参数

### 13.4 Editor Agent 过早成为主依赖
如果还没把基本手动编辑打磨好，就把复杂的 editor agent / MCP 体系放到主路径上，交付风险会很高。

缓解方案：

- 当前版本先完成手动编辑闭环
- Editor Agent 后续逐步接入
- 让 agent 编辑复用同一套选区、节点 id 和 inspector 体系

### 13.5 右侧 Workspace 重新膨胀
如果又把所有控制项都塞回右侧，会回到 1.x 的“复杂控制台”状态。

缓解方案：

- 右侧聚焦 Assistant / Spots / Remix 三类主任务
- 只在 Assistant tab 内承载与选中内容强相关的检查器和 AI 输入

## 14. MVP 推荐路径

### Phase A：2.0 alpha

- 接入 `Apify -> session 存储 -> 分析 jobs` 的新链路
- 明确由 `Generation Agent` 执行首次生成链路
- 明确由 `Remix Agent` 执行基于 session 的重生成链路
- 去掉 README 和产品叙事里的 block 主流程
- 生成第一版 handbook HTML
- 同时生成与 handbook 对齐的 spots dataset
- 提供 `Spots` tab 与 CSV 导出
- 提供 `Remix` tab 与风格 preset
- 优先完成普通手动编辑能力
- 保持 processing / edit 两态的统一框架

### Phase B：2.0 beta

- 做强一点的 spots 与页面 section 联动
- 在不破坏手动编辑闭环的前提下，逐步接入 `Editor Agent`
- 提升 Assistant 的局部编辑能力
- 增强风格 preset 的差异性
- 提供更好的 checkpoint / restore

### Phase C：2.1

- 更强的地图联动
- 更成熟的 GrapeJS 二次编辑衔接
- 更完整的 GrapesJS MCP 操作能力
- 可协作的 handbook 工作流
- 更细的来源锚点与可信度回溯

## 15. 成功指标

### 用户价值指标

- 从 URL 输入到首个可编辑 handbook 的时间
- 生成后继续编辑 handbook 的 session 占比
- spots 查看与 CSV 导出使用率
- remix 使用率与重复 remix 次数
- 手动编辑完成率

### 质量指标

- 首次 draft 后被直接放弃的 session 占比
- remix 后继续保留的版本占比
- remix 结果与前一版本的区分度
- spots 与最终 handbook 内容的一致性
- AI 编辑后的恢复 / 回滚使用率

### 方向性指标

- 用户接触 block / 原始结构化输出的次数下降
- Assistant / Spots / Remix 三个工作区的使用率上升
- 基于同一 session 数据重复生成不同风格 handbook 的占比上升

## 16. 这份 README 当前确认的设计结论

1. `block` 不再是用户主流程，也不再是 README 的核心叙事。
2. 系统应拆成 `Generation Agent / Remix Agent / Editor Agent` 三类职责清晰的执行入口。
3. 生成链路应改写为 `Apify 爬取 -> session 存储 -> 多工序分析 -> handbook + spots 产出`。
4. 最终产物是 `handbook HTML` 与 `Google Maps CSV`，而不是 block。
5. Spots 要服务于当前 handbook 成品，而不是只服务于原始抓取结果。
6. Remix 基于当前 session 已存数据进行，不依赖标准 Block。
7. session 数据必须保留足够的表达空间，避免 remix 与新建结果高度趋同。
8. 当前版本应先完成普通手动编辑，`Editor Agent` 作为后续增强逐步接入。
9. 右侧工作区应以 `Assistant / Spots / Remix` 为主，而不是旧版的 tool log / block panel。

## 17. 本目录交付物

- [README.md](README.md)：2.0 产品方案说明
- [pencil-demo.pen](../../pencil-demo.pen)：当前 2.0 原型源文件
