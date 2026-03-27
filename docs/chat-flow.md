# Chat / Tool 执行流（多 Handbook + Handbook First）

本文描述当前代码的真实行为：一个 `Session` 下可生成多个 `Handbook`，前后端以 `handbookId` 为主键完成预览、发布和分享；当前 2.0 最小落地语义已经切到 `Generation / Remix / Manual Edit`，并且后端主链路已经升级为 `session analysis` 驱动。`SessionState.blocks / spotBlocks` 仍保留，但只作为兼容缓存，不再是 2.0 的主数据来源。

## 1. 从页面到 `/api/chat`

### 1.1 首条输入
- 页面：`src/app/session/[id]/page.tsx`
- 用户输入会先走 `toGuidePrompt`：
- 若是 YouTube URL，规范化为：`Create a travel guide from this video: <url>`
- 否则保留原文本

### 1.2 自动发首条消息
- 路由带 `?initial=...` 时，页面自动 `sendMessage`
- 使用 `sessionStorage` 去重，避免刷新后重复触发
- 发送后 `router.replace(pathname)` 清掉 `initial`

### 1.3 请求参数
- `POST /api/chat`
- body: `{ sessionId, messages }`

## 2. 后端编排主流程（`src/agent/chat.ts`）

### 2.1 两种 orchestration 模式
- `full_pipeline`：标准首轮生成（Apify / 解析 / session analysis / 坐标 / 图片 / HTML）
- `handbook_regen`：当前 Remix 兼容模式
  - 新文案前缀：`Remix a new handbook from the latest saved session data.`
  - 旧前缀 `Generate handbook HTML from edited blocks.` 仍继续接受，避免老会话和旧消息压缩逻辑失效

### 2.2 Remix 的工具门控
- 若 `runtime` 已有 `sessionAnalysis 或兼容 blocks + prepared images`：
  - `activeTools = ['generate_handbook_html']`
  - `toolChoice` 强制为 `generate_handbook_html`
- 若只有 `sessionAnalysis / blocks`、没有 prepared images：
  - `activeTools = ['search_image', 'generate_image', 'generate_handbook_html']`

说明：这条路径虽然内部仍叫 `handbook_regen`，但产品语义上已经是当前版本的 `Remix Agent`。

### 2.3 stop 条件
- `stopWhen`：
  - 步数上限（按模式不同）
  - 或本次请求已产出 handbook（`runtime.requestHasGeneratedHandbook=true`）

## 3. Runtime 恢复与快照

### 3.1 请求开始恢复
- 从 `SessionState` 恢复：
  - `context.sessionAnalysis`
  - `context/blocks/spotBlocks/toolOutputs`
  - `latestHandbookImages`（优先从 toolOutputs，再从 context）
  - `latestVideoContext`、`latestHandbookStyle`
  - 若旧会话没有 `sessionAnalysis`，仍从 `blocks / spotBlocks` 兼容恢复

### 3.2 每步成功后快照
- `persistSessionSnapshot` 仅写运行态：
  - `context.sessionAnalysis`
  - `context/blocks/spotBlocks/toolOutputs`
- 不再把 HTML 作为唯一产物写回 `SessionState.handbookHtml`

## 4. Tool 顺序与职责

标准流程的核心顺序：
1. `parse_youtube_input`
2. `crawl_youtube_videos`
3. `analyze_session_data`
   - 对模型与前端消息流，2.0 统一使用这个新名字
   - 底层持久化仍沿用 `build_travel_blocks`，以兼容当前 Prisma enum / SessionStep 记录
   - 真实语义已经改成 `Analyze Session Data`
   - 主输出是 `session_analysis`，包含 sections / spots / remix hints
4. `resolve_spot_coordinates`（有 spot 时）
5. `search_image` 或 `generate_image`
6. `generate_handbook_html`

关键约束：
- 位置坐标只能来自地理编码，不允许模型臆造
- `generate_handbook_html` 的主输入已经是 `session analysis`
- `blocks / spot_blocks` 仍会从 `session analysis` 派生，服务兼容编辑和旧显示逻辑
- `generate_handbook_html` 前必须有图片素材；如果无 prepared images 且有 `thumbnailUrl`，工具会回退为“缩略图兜底素材”

## 5. HTML 生成后如何持久化（多 Handbook）

`generate_handbook_html` 成功后：
1. 首轮生成与 remix 都写入新的 `Handbook` 产物
2. 若 remix 先创建了占位 handbook，则工具会更新该占位 draft，而不是覆盖当前激活 handbook
3. 将最终 `Handbook` 设为 `Session.activeHandbookId`
4. 返回：
   - `handbook_id`
   - `preview_url`（`/api/guide/{handbookId}`）
   - `generation_kind`（`initial | remix`）

补充：
- `Handbook.sourceContext` 会记录最小 provenance（例如 `generationKind`）
- `Handbook.sourceContext.sessionAnalysis` 会记录当前 2.0 主分析数据
- `SessionState` 继续保留旧字段仅做兼容与回滚，不作为主展示源

## 6. 前端展示与交互

### 6.1 handbook-first 工作区
- 中间区域默认优先打开 `Handbook` 视图，而不是 block 编辑器
- 详情页顶部使用 handbook 选择器
- 切换后使用 `activeHandbookId` 更新中间预览
- `Blocks` 仍保留，但作为兼容编辑路径，不再是主心智入口

### 6.2 Remix 与普通手动编辑
- handbook 视图工具栏可以直接触发 Remix
- handbook 视图顶部可进入普通手动 HTML 编辑
- 当前手动编辑是 `HTML draft + live preview` 的最小版本：
  - 读取当前 active handbook HTML
  - 通过 `PATCH /api/sessions/[id]/handbooks/[handbookId]` 保存
  - 支持 dirty state / save / reset / handbook switch discard guard
- 未来的 `Editor Agent + MCP` 暂未接入本流程

### 6.3 生命周期操作
- lifecycle 为 handbook 级：`DRAFT | PUBLIC | ARCHIVED`
- 前端统一调用：
  - `PATCH /api/sessions/[id]/handbooks/[handbookId]/lifecycle`
- 已移除前端对旧 `session` 级 lifecycle 路径的调用

### 6.4 分享与预览
- 预览：`/api/guide/{handbookId}`
- Public 分享：`/api/public/guide/{handbookId}`
- `external-link` 动作为复制 public 链接

## 7. API 面（多 Handbook）

### 7.1 会话
- `GET /api/sessions`
- `POST /api/sessions`
- `GET /api/sessions/[id]`
- `PATCH /api/sessions/[id]`
- `DELETE /api/sessions/[id]`
- `PATCH /api/sessions/[id]/state`
- `POST /api/sessions/[id]/cancel`

### 7.2 handbook
- `GET /api/sessions/[id]/handbooks`
- `POST /api/sessions/[id]/handbooks`
- `PATCH /api/sessions/[id]/handbooks/[handbookId]`
- `DELETE /api/sessions/[id]/handbooks/[handbookId]`
- `POST /api/sessions/[id]/handbooks/[handbookId]/activate`
- `PATCH /api/sessions/[id]/handbooks/[handbookId]/lifecycle`

### 7.3 预览与公开
- `GET /api/guide/[id]`（优先按 `handbookId` 解析，兼容 sessionId）
- `GET /api/public/guide/[id]`（优先按 `handbookId` 解析，兼容旧 public session 路径）

## 8. 错误与取消语义

- 取消：`/api/sessions/[id]/cancel` -> `Session.status = CANCELLED`
- tool 失败：`SessionStep = ERROR`，并记录 `Session.failedStep/lastError`
- 请求正常结束：`markSessionCompleted`

补充：步骤失败持久化已增加事务降级，避免“记录失败步骤”本身再次失败而覆盖原始错误。

## 9. 排查清单（多 Handbook）

1. `The table public.Handbook does not exist`
- 说明 DB 尚未执行多 handbook migration
- 先执行 migration SQL，再跑 backfill

2. Remix 无图失败
- 检查 `context.video.thumbnailUrl` 是否存在
- 检查 `context.sessionAnalysis` 是否存在
- 或先跑 `search_image/generate_image`

3. 页面看不到新 handbook
- 检查 `createSessionHandbook` 是否成功
- 检查 `Session.activeHandbookId` 是否更新
- 检查 `GET /api/sessions/[id]/handbooks` 是否返回新记录
