# Tabi 产品 2.0 方案

## 1. 产品定义

### 1.1 一句话定义
Tabi 2.0 要从一个“`video -> block -> HTML` 生成器”，升级为一个真正的 `AI 旅行手册创作工作台`：

- 用户导入视频或其他旅行素材
- AI 先生成一个完整可发布的旅行手册网页
- 用户直接在页面上进行可视化编辑
- 用户可以针对局部区域与 AI 协作修改
- 用户可以在不重复跑原始数据链路的前提下，把当前手册 remix 成新的表达风格

### 1.2 为什么必须做 2.0
当前 1.0 更像一个内部流程工具，还没有成长为一个成熟的创作型产品：

- 生成出来的 handbook 结构过于统一，模板感明显
- `block` 这套心智对系统有帮助，但对用户来说太僵硬
- 右侧对话区域暴露了太多系统输出，而不是用户价值
- handbook version 增加了系统复杂度，但不符合用户直觉
- 用户虽然可以生成内容，但“和 AI 一起打磨一个好网页”的感觉仍然很弱

2.0 的目标，是让最终产物不再像“结构化数据渲染出的页面”，而更像“一个由 AI 协助完成的真实旅行编辑页”。

## 2. 产品愿景

### 2.1 核心转变
`对用户隐藏结构，对系统保留结构。`

在 2.0 中：

- 用户不再以编辑 `block` 作为主流程
- 产品的核心对象变成 `handbook 网页本身`
- AI 可以更自由地决定布局和页面编排
- 风格选择仍然保留，但不再只是换颜色和字体
- AI 编辑应该绑定在页面区域上，而不是绑定在原始 JSON 上

### 2.2 产品原则

1. `Page-first`
主画布应该是 handbook 页面本身，而不是中间数据。

2. `AI 是协作者，不是黑盒`
用户应该可以明确要求 AI 修改某个选中区域、调整语气、替换布局，或者 remix 整个页面。

3. `有来源支撑的可信感`
即使 UI 层面去掉了 blocks，地点、图片、路线和来源理解仍然要保留，而且用户要能感知到这些信息是可信的。

4. `快速迭代，但保留安全感`
我们可以简化显式 version UI，但仍然要保留轻量级 checkpoint 和恢复能力。

5. `侧边面板必须有用`
2.0 里保留下来的每一个面板，都必须帮助用户做出更好的 handbook，而不是暴露内部实现细节。

## 3. 用户核心任务

### 3.1 核心功能任务

- “把这段旅行视频变成一个看起来可以发布的网页。”
- “让这个 guide 更像一篇旅行编辑内容，而不是数据报告。”
- “我想改页面，但不想每次都从头重建。”
- “我想只让 AI 改某一部分，而不要影响整页。”
- “我想看见地点和路线，这样我才更信任这个 guide，也更方便我继续优化。”

### 3.2 情绪层任务

- “我希望自己是在主导页面，而不是在和系统对抗。”
- “我希望最终结果看起来真的像设计过的。”
- “我希望编辑的时候有安全感，不会轻易丢掉之前已经改好的东西。”

## 4. 体验模型

### 4.1 新的一层心智模型

- `Session` = 一个 handbook 项目
- `Handbook` = 这个 session 里的当前在线网页
- `Remix` = 基于当前内容生成一个新的表达版本，必要时可以创建为新 session
- `Assistant` = 面向局部或整页修改的 AI 协作助手

这套模型将替代当前用户可见的旧模型：

- session
- tool outputs
- block editor
- handbook versions

### 4.2 核心流程

1. 用户粘贴 YouTube URL，或从已有项目进入
2. Tabi 爬取内容并完成来源理解
3. AI 基于用户选择的风格模式生成第一版完整网页
4. 用户直接进入一个网页编辑工作台
5. 用户通过三种方式继续编辑：
   - 页面上的可视化编辑
   - 针对某个选中区域的 AI 编辑
   - 整页 remix 或风格刷新
6. 用户发布、复制，或将其 remix 成新的 session

### 4.3 生成过程体验设计

2.0 不应该让用户在长流程里“干等最终结果”，而应该尽快把用户带入一个可以参与的初稿工作台。

推荐的生成过程分为四段：

1. `Source analyzing`
系统解析视频、提取地点、判断内容主题，并把当前阶段明确反馈给用户。

2. `Structured draft ready`
只要标题方向、地点列表、页面 outline、hero 草稿这些关键元素可用，就先打开 Studio，而不是等整页 HTML 完成。

3. `Progressive page generation`
页面按区域逐步长出来，例如先出现 page shell 和 hero，再补全 places、route、图片和次级 section。

4. `Background enrichment`
图片补全、路线增强、次要 section 润色、SEO 信息等可以继续在后台完成，不阻塞用户进入编辑。

这意味着生成中的用户仍然可以：

- 看到当前进行到哪一步
- 先确认地点和路线是否正确
- 先选择 expression mode
- 先改 hero 标题、导语或页面方向
- 在首版初稿可用后立即进入编辑，而不是等待所有异步任务完成

产品原则上要把“等待生成完成”，改造成“快速进入可编辑初稿，再由系统持续补全”。

## 5. 2.0 的核心变化

### 5.1 去掉 `block` 作为主 UI 对象

产品决策：

- 主界面不再以 block-first 方式组织编辑
- 对话区域不再展示结构化输出结果
- 系统内部继续保留语义内容层，用于 AI 编辑、地点提取和来源一致性

这意味着：

- 用户编辑的是 `sections`、`regions`、`hero`、`route strip`、`place cards`、`quote panels`、`gallery bands`、`summary modules`
- AI 仍然可以精确修改某个区域，因为系统底层仍然保留隐藏结构

### 5.2 保留风格选择，但升级为表达模式

当前的 style 更像皮肤切换，表达力不够。

在 2.0 中，style 要升级成 `expression mode`，例如：

- `Editorial Magazine`
- `Map-first Explorer`
- `Food-first Journey`
- `Minimal Journal`
- `City Notes`
- `Luxury Weekend`

每个模式不仅影响视觉风格，还要影响：

- 布局语法
- 章节重点
- 页面密度
- 图片处理方式
- 文案语气
- 地图与路线的权重

这样既能给用户稳定预期，又不会把结果锁死在同一个模板里。

### 5.3 用“当前草稿 + Remix”取代 handbook versions

用户可见的 handbook version 管理应该被移除，或者大幅弱化。

推荐的用户心智是：

- 一个 session 只有一个当前 handbook
- 用户直接编辑这个当前 handbook
- 当用户想尝试大幅不同的方向时，使用 “Remix as new session” 创建分支

推荐的系统行为是：

- 在高风险 AI 操作前自动创建 checkpoint
- 支持恢复最近 checkpoint
- 支持 duplicate as new session

产品立场：

- `可见版本 UI`：简化
- `恢复能力`：保留

### 5.4 把右侧聊天面板升级为 Assistant Workspace

右侧区域不应该再是原始 tool output 的展示区。

它应该变成一个真正有用的 `Assistant Workspace`，可以包含这些 tab：

- `Edit`
  - 当前选中区域摘要
  - prompt 快捷入口，例如“压缩文案”“更有电影感”“突出美食”
  - 自由输入的 AI 指令框
- `Places`
  - 提取出的地点
  - 路线与地图预览
  - 可信度 / 校验状态
- `Style`
  - expression modes
  - 字体与排版方向
  - 页面密度控制
  - remix 动作
- `Assets`
  - 封面图
  - 分段图片
  - 替换 / 重生成操作

### 5.5 让地图与地点理解成为一等能力

这是 2.0 最值得被用户感知的价值之一。

相比展示原始 JSON，产品应该展示：

- 地点列表
- 路线概览
- 嵌入式地图
- 顺序或距离关系
- 页面 section 和地图地点之间的联动关系

示例交互：

- 点击右侧地点 -> 高亮页面对应 section
- 点击页面某个 section -> 地图聚焦对应地点
- 让 AI “重写这一段，并强化地图与路线信息”

## 6. 建议的信息架构

### 6.1 主布局

1. `Top bar`
项目标题、来源状态、expression mode、设备预览切换、remix、publish

2. `Left rail`
仅保留 session list，作为项目主导航

3. `Center canvas`
可编辑预览状态下的 handbook 网页

4. `Right assistant workspace`
承载 AI 编辑、项目上下文、页面结构、地点、风格和素材

### 6.2 UI 中的核心对象

- project
- source
- page
- section
- place
- asset
- AI suggestion
- checkpoint

## 7. 编辑模型

### 7.1 三种编辑方式

1. `Visual edit`
直接在页面上点击并编辑内容

2. `AI edit`
选中某个 section，要求 AI 重写或重构该区域

3. `Code edit`
面向高级用户的 HTML/CSS 编辑模式

产品建议：

- visual edit 是默认模式
- AI edit 一键可达
- code edit 是高级能力，不应该成为主叙事

### 7.2 AI 编辑范围

AI 应该支持明确的 scope 控制：

- 仅修改当前 section
- 修改一组 section
- 仅修改 page shell
- 修改整个 handbook

这会显著降低用户的焦虑感，并提升信任。

## 8. 产品层的数据对象方向

从产品视角看，最终保存的对象应该是：

- 以 handbook HTML/CSS 作为主编辑产物
- 以来源理解和地点提取作为辅助智能层
- 以轻量 checkpoint 作为回滚机制
- 以风格 / expression metadata 作为未来 remix 的基础

这里有一个关键产品判断：

- 用户应该感受到自己保存的是一个 `网页`
- 而不是一个数据流程快照

## 9. 关键风险

### 9.1 布局自由度过高
如果完全放开给 LLM 自由生成，结果质量的波动会很大。

缓解方案：

- 引入 expression modes
- 定义布局护栏
- 保留由来源驱动的事实层

### 9.2 AI 覆盖用户已有工作
如果 AI 太容易整页重写，用户会很快失去信任。

缓解方案：

- 强 scope 控制
- 自动 checkpoint
- 大改动先预览再应用

### 9.3 有价值的结构被一起删掉
如果 blocks 同时从 UI 和系统里消失，地图联动、地点锚定、局部改写和来源一致性都会被削弱。

缓解方案：

- 从用户心智中移除 block
- 但在系统内部保留语义结构

### 9.4 右侧面板再次变成复杂控制中心
如果不断往 Assistant 面板里塞东西，它会再次变得拥挤难用。

缓解方案：

- 控制在 3 到 4 个核心 tab
- 基于当前选中内容做 contextual default
- 低价值控制项按需隐藏

## 10. MVP 推荐路径

### Phase A：2.0 alpha

- 保留 crawl + source extraction
- 生成完整网页，而不是 block 拼装后的页面
- 支持生成中的阶段反馈与渐进式初稿
- 增加 expression mode selector
- 增加可编辑网页画布
- 右侧替换为 Assistant / Places / Style
- 在主界面移除可见 handbook versions
- 系统内部保留 checkpoint

### Phase B：2.0 beta

- 支持 section 级 AI 编辑
- 支持地图到页面的联动
- 增加带图片替换能力的 Assets tab
- 支持 remix as new session

### Phase C：2.1

- 协作编辑
- 发布预设
- 更强的来源校验与可信度提示
- 可复用 section recipe 与品牌套件

## 11. 成功指标

### 用户价值指标

- 从 source URL 到首个可发布 handbook 的时间
- 生成后继续手动编辑的 session 占比
- 使用 AI 做局部修改而不是整页重生成的 session 占比
- publish / share 完成率

### 质量指标

- AI 编辑后 restore / undo 的使用率
- 首次生成后被放弃的 session 数量
- 用户对首次输出和编辑后结果的满意度评分

### 方向性指标

- 用户接触原始结构化输出的交互次数下降
- map / place / asset 面板使用率上升
- visual mode 编辑占比相对 raw code mode 的提升

## 12. 建议的设计方向

2.0 应该让人感觉到：

- editorial
- tactile
- map-aware
- premium but not enterprise
- creative, not technical

它不应该让人感觉像：

- 一个内部流程工具
- 一个 JSON 调试器
- 一个 block CMS
- 一个面向旅行数据的开发者工具

## 13. 下次产品评审建议确认的决策

1. 确认 `page-first` 将替代 `block-first`，成为核心体验模型。
2. 确认主界面将移除显式 handbook version 管理。
3. 确认右侧区域将升级为 assistant workspace，而不是 tool log。
4. 确认 style 将升级为 `expression mode`，而不只是视觉皮肤。
5. 确认即使 UI 上移除了 versions，系统内部仍然保留轻量 checkpoint。
6. 确认地图 / 地点可视化将成为编辑体验中的一等能力。

## 14. 本目录交付物

- [README.md](README.md)：产品方案说明
- [studio-demo.html](studio-demo.html)：2.0 编辑态的 HTML 可视化原型
- [generation-demo.html](generation-demo.html)：2.0 生成中的 HTML 可视化原型
