# Chat / Tool 执行流（多 Handbook 版本）

本文描述当前代码的真实行为：一个 `Session` 下可生成多个 `Handbook`，前后端以 `handbookId` 为主键完成预览、发布和分享。

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
- `full_pipeline`：标准全链路（解析视频 -> blocks -> 坐标 -> 图片 -> HTML）
- `handbook_regen`：手动再生模式（用户文本前缀命中 `Generate handbook HTML from edited blocks.`）

### 2.2 手动再生的工具门控
- 若 `runtime` 已有 `blocks + prepared images`：
  - `activeTools = ['generate_handbook_html']`
  - `toolChoice` 强制为 `generate_handbook_html`
- 若只有 `blocks`、没有 prepared images：
  - `activeTools = ['search_image', 'generate_image', 'generate_handbook_html']`

### 2.3 stop 条件
- `stopWhen`：
  - 步数上限（按模式不同）
  - 或本次请求已产出 handbook（`runtime.requestHasGeneratedHandbook=true`）

## 3. Runtime 恢复与快照

### 3.1 请求开始恢复
- 从 `SessionState` 恢复：
  - `context/blocks/spotBlocks/toolOutputs`
  - `latestHandbookImages`（优先从 toolOutputs，再从 context）
  - `latestVideoContext`、`latestHandbookStyle`

### 3.2 每步成功后快照
- `persistSessionSnapshot` 仅写运行态：
  - `context/blocks/spotBlocks/toolOutputs`
- 不再把 HTML 作为唯一产物写回 `SessionState.handbookHtml`

## 4. Tool 顺序与职责

标准流程的核心顺序：
1. `parse_youtube_input`
2. `crawl_youtube_videos`
3. `build_travel_blocks`
4. `resolve_spot_coordinates`（有 spot 时）
5. `search_image` 或 `generate_image`
6. `generate_handbook_html`

关键约束：
- 位置坐标只能来自地理编码，不允许模型臆造
- `block.type` 仅允许：`food | spot | transport | shopping | other`
- `generate_handbook_html` 前必须有图片素材；如果无 prepared images 且有 `thumbnailUrl`，工具会回退为“缩略图兜底素材”

## 5. HTML 生成后如何持久化（多 Handbook）

`generate_handbook_html` 成功后：
1. 创建新的 `Handbook` 记录（而不是覆盖单一 session HTML）
2. 将新 `Handbook` 设为 `Session.activeHandbookId`
3. 返回：
   - `handbook_id`
   - `preview_url`（`/api/guide/{handbookId}`）

补充：`SessionState` 继续保留旧字段仅做兼容与回滚，不作为主展示源。

## 6. 前端展示与交互

### 6.1 handbook 列表与切换
- 详情页顶部使用 handbook 选择器
- 切换后使用 `activeHandbookId` 更新中间预览

### 6.2 生命周期操作
- lifecycle 为 handbook 级：`DRAFT | PUBLIC | ARCHIVED`
- 前端统一调用：
  - `PATCH /api/sessions/[id]/handbooks/[handbookId]/lifecycle`
- 已移除前端对旧 `session` 级 lifecycle 路径的调用

### 6.3 分享与预览
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

2. 手动再生无图失败
- 检查 `context.video.thumbnailUrl` 是否存在
- 或先跑 `search_image/generate_image`

3. 页面看不到新 handbook
- 检查 `createSessionHandbook` 是否成功
- 检查 `Session.activeHandbookId` 是否更新
- 检查 `GET /api/sessions/[id]/handbooks` 是否返回新记录
