# 进程管理（端到端）

本文面向第一次接手项目的同学，描述当前「Travel Guide Agent」的完整进程管理方案：前端状态、后端编排、数据库落库、失败/取消处理、恢复机制。

## 1. 项目由哪些部分构成

### 1.1 前端（Next.js App Router）
- 主页面：`src/app/session/[id]/page.tsx`
- 外层布局：`src/app/session/[id]/layout.tsx`
- 右侧消息渲染：`src/app/session/[id]/_components/message-content.tsx`
- 中间 Block 编辑器：`src/app/session/[id]/_components/block-editor-workspace.tsx`
- 状态管理（zustand）：`src/stores/sessions-store.ts`（左侧会话列表）
- 状态管理（zustand）：`src/stores/session-store.ts`（单次会话流程状态）
- 状态管理（zustand）：`src/app/session/[id]/_stores/session-editor-store.ts`（编辑/预览状态）

### 1.2 后端（Next API + 服务层）
- 工具编排入口：`POST /api/chat` -> `src/app/api/chat/route.ts`
- 会话接口：`/api/sessions`、`/api/sessions/[id]`、`/api/sessions/[id]/state`、`/api/sessions/[id]/cancel`
- Guide 预览接口：`GET /api/guide/[id]`（兼容旧地址 `/api/handbook/[id]`）
- 服务层：`src/server/events.ts`（步骤事件 + 消息落库 + 会话状态标记）
- 服务层：`src/server/sessions.ts`（会话读写、状态快照、summary/detail 映射）

### 1.3 外部依赖
- LLM/图像：DeepSeek、Google Gemini、Google Imagen
- 数据源：Apify（YouTube 抓取）、Unsplash（素材图）、Nominatim（地理编码）
- 存储：PostgreSQL + Prisma

## 2. 数据模型（Prisma）

文件：`prisma/schema.prisma`

### 2.1 `Session`
- 会话主表，核心字段：
- `status`：`IDLE | RUNNING | COMPLETED | ERROR | CANCELLED`
- `currentStep` / `failedStep`：当前步骤与失败步骤（`SessionToolName`）
- `startedAt`：首次进入运行态时写入，不会在后续重复刷新
- `completedAt` / `cancelledAt` / `lastError`

### 2.2 `ChatMessage`
- 按 `sessionId + externalId` 唯一保存聊天消息
- 保存 `role`、`parts`（完整 AI SDK message parts）、提取后的 `text`
- `seq` 用于恢复顺序

### 2.3 `SessionStep`
- 每个 tool 一次执行记录一行
- 包含：`toolName`、`status`、`input`、`output`、`errorMessage`、`durationMs`
- 状态：`RUNNING | SUCCESS | ERROR | CANCELLED`

### 2.4 `SessionState`
- 会话快照表（恢复页面核心）
- 字段：
- `context`（视频上下文 + apify 结果，包含 `video.thumbnailUrl`）
- `blocks` / `spotBlocks`
- `toolOutputs`（按 toolName 聚合）
- `handbookHtml`
- `handbookVersion` / `handbookGeneratedAt`
- `previewPath`（例如 `/api/guide/<sessionId>`）

### 2.5 工具枚举 `SessionToolName`
- `parse_youtube_input`
- `crawl_youtube_videos`
- `build_travel_blocks`
- `resolve_spot_coordinates`
- `search_image`
- `generate_image`
- `generate_handbook_html`

## 3. 会话状态机与事件流

### 3.1 开始执行
1. 前端发 `POST /api/chat`，带 `sessionId + messages`
2. 后端 `ensureSessionRunning`：
- 会话不存在则创建并置 `RUNNING`
- 已存在则更新到 `RUNNING`
- `startedAt` 仅在空值时补写，保证显示首次开始时间
3. `upsertChatMessages` 先存一版当前消息

### 3.2 每个 tool 执行时
通过 `runToolStep(...)` 统一包裹：
1. `createSessionStep` 新建 `RUNNING` 步骤，并同步 `Session.currentStep`
2. 执行具体工具逻辑
3. 成功则 `completeSessionStep`，并 `upsertSessionState`
4. 失败则 `failSessionStep`（同时把 `Session` 标记 `ERROR`）
5. 如果请求中断（Abort）则 `cancelSessionStep`（同时 `Session` 标记 `CANCELLED`）

### 3.3 请求结束时
- `onFinish`：
- 再次 `upsertChatMessages`（最终消息）
- 再次 `upsertSessionState`（最终快照）
- 若中断 -> `markSessionCancelled`
- 否则 -> `markSessionCompleted`
- `onError`：`markSessionError`

## 4. 前端三层状态管理

### 4.1 `sessions-store`（会话列表态）
文件：`src/stores/sessions-store.ts`

职责：
- 拉取和维护左侧会话列表
- 对外暴露 `add/update/remove/hydrateFromServer/refreshIfNeeded`
- 30 秒 TTL + window focus 自动刷新（`useHydrateSessionsStore`）

### 4.2 `session-store`（流程进度态）
文件：`src/stores/session-store.ts`

职责：
- 从 `useChat()` 的 messages 反推每个步骤状态
- 维护：
- `currentStep` / `failedStep`
- `completedSteps`
- `steps[toolName] = idle/loading/success/error`
- `toolOutputs`、`loading`、`error`

注意：
- `search_image` 和 `generate_image` 是分支关系，任一成功即视为图像阶段已满足。

### 4.3 `session-editor-store`（编辑与预览态）
文件：`src/app/session/[id]/_stores/session-editor-store.ts`

按 `sessionId` 保存：
- `editedToolOutputs`
- `editorSession`
- `handbookHtml` / `handbookPreviewUrl`
- `handbookStatus` / `handbookError`
- `centerViewMode`（`blocks` 或 `html`）
- `previewDevice`（`desktop` 或 `mobile`）

## 5. 恢复机制（刷新后如何还原）

会话页首次加载会调用 `GET /api/sessions/[id]`：
1. 恢复历史 `messages` 到 `useChat`
2. 从 `state.handbookHtml/previewPath` 恢复 HTML 预览
3. 从 `state.toolOutputs` 或 `state.blocks` 恢复可编辑 blocks（包含 `thumbnailUrl` 头图信息）
4. 自动把中间视图切到 `html` 或 `blocks` 对应状态

另外，编辑器有 900ms 自动保存，保存到 `PATCH /api/sessions/[id]/state`（`blocks/spotBlocks/toolOutputs`）。

## 6. 关键接口清单

### 6.1 会话与流程
- `POST /api/chat`：主编排（流式 + tool）
- `GET /api/sessions`：会话列表
- `POST /api/sessions`：新建会话
- `GET /api/sessions/[id]`：会话详情（含 messages + steps + state）
- `PATCH /api/sessions/[id]`：更新标题/状态等
- `DELETE /api/sessions/[id]`：删除会话
- `PATCH /api/sessions/[id]/state`：局部更新状态快照
- `POST /api/sessions/[id]/cancel`：手动取消

### 6.2 Guide 预览
- `GET /api/guide/[id]`：返回完整 HTML（`text/html`）
- `GET /api/handbook/[id]`：旧路径兼容

## 7. 新人启动与运维要点

### 7.1 必要环境变量
- `DATABASE_URL`
- `DEEPSEEK_API_KEY`
- `GOOGLE_GENERATIVE_AI_API_KEY`
- `APIFY_API_KEY`

### 7.2 推荐环境变量
- `UNSPLASH_ACCESS_KEY`（用于稳定拉取真实图库；不可用时 `search_image` 会自动回退到 Imagen 生成，避免裂图）

### 7.3 常用命令
```bash
npm install
npm run prisma:push
npm run prisma:generate
npm run dev
```

查看数据库可用：
```bash
npm run prisma:studio
```

## 8. 常见问题与排查

### 8.1 `Invalid value for argument toolName. Expected SessionToolName`
- 原因：Prisma 枚举和代码不一致（常见于新增 tool 后未同步 DB）。
- 处理：执行 `npm run prisma:push`（必要时再 `npm run prisma:generate`）。

### 8.2 HTML 预览为空
- 检查是否已走 `search_image` 或 `generate_image`，再调用 `generate_handbook_html`
- 检查 `SessionState.handbookHtml` 与 `previewPath` 是否存在

### 8.3 会话时间显示异常
- 当前列表时间基于 `startedAt ?? createdAt`
- `startedAt` 只在首次运行写入，不会每次进入页面重置

## 9. 当前实现边界

1. 同一会话多标签同时编辑，后写入会覆盖先写入，暂无冲突合并。
2. 地理编码目前使用单一 Nominatim，存在速率/可用性边界。
3. `stopWhen: stepCountIs(9)` 是硬上限，复杂多轮请求可能触顶。
