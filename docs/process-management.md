# 进程管理（多 Handbook / Generation / Remix）

本文面向接手项目同学，描述当前 Travel Guide Agent 的端到端进程管理：前端状态、后端编排、数据库落库、恢复机制、运维操作。当前 2.0 的最小落地策略是：不改 Prisma schema，继续保留 `SessionState` 作为兼容缓存，但真正的生成主数据已经切到 `session analysis`，产品层切到 `Generation / Remix / Manual Edit`。

## 1. 系统组成

### 1.1 前端（Next.js App Router）
- 会话页：`src/app/session/[id]/page.tsx`
- 详情布局：`src/app/session/[id]/layout.tsx`
- 会话列表 store：`src/stores/sessions-store.ts`
- handbook 列表 store：`src/stores/handbooks-store.ts`
- 编辑态 store：`src/app/session/[id]/_stores/session-editor-store.ts`

### 1.2 后端（API + 服务层）
- 编排入口：`POST /api/chat` -> `src/app/api/chat/route.ts`
- 会话服务：`src/server/sessions.ts`
- 步骤/消息事件：`src/server/events.ts`
- 快照持久化：`src/agent/context/persistence.ts`

### 1.3 外部依赖
- LLM/图像：DeepSeek、Gemini、Imagen
- 数据源：Apify、Unsplash、Nominatim
- 存储：PostgreSQL + Prisma

## 2. 数据模型（当前）

文件：`prisma/schema.prisma`

### 2.1 `Session`
- 主会话实体
- 关键字段：
  - `status/currentStep/failedStep/lastError`
  - `activeHandbookId`（当前选中 handbook）

### 2.2 `Handbook`
- 一个 session 下可有多条记录
- 关键字段：
  - `id`（handbookId）
  - `sessionId`
  - `title/html`
  - `lifecycle`（`DRAFT | PUBLIC | ARCHIVED`）
  - `publishedAt/archivedAt/generatedAt`
  - `previewPath/style/thumbnailUrl`
  - `sourceContext/sourceBlocks/sourceSpotBlocks/sourceToolOutputs`

### 2.3 `SessionState`
- 运行态快照：`context.sessionAnalysis + context/blocks/spotBlocks/toolOutputs`
- 保留旧 handbook 字段用于兼容和回滚（逐步下线）
- 当前 first pass **不迁移** 这些字段：
  - `blocks`
  - `spotBlocks`
  - `toolOutputs`
- 2.0 主链路优先依赖 `context.sessionAnalysis`
- Remix 与 Spots 的兼容路径仍可读取 `blocks / spotBlocks`

### 2.4 `SessionStep`
- 每个工具步骤一条记录：`RUNNING/SUCCESS/ERROR/CANCELLED`

### 2.5 `ChatMessage`
- 聊天消息持久化，支持刷新恢复

## 3. 会话状态机与执行事件

### 3.1 请求开始
1. `POST /api/chat`
2. `ensureSessionRunning`
3. `upsertChatMessages`（初始消息）
4. `hydrateRuntimeState`

### 3.2 每个工具步骤
1. `createSessionStep`
2. 执行 tool
3. 成功：`completeSessionStep` + `persistSessionSnapshot`
4. 失败：`failSessionStep`
5. 取消：`cancelSessionStep`

补充：`failSessionStep/cancelSessionStep` 在事务失败时会降级为顺序更新，避免“错误持久化失败”覆盖原始错误。

### 3.3 请求结束
- `onFinish`：更新消息 + 快照 + `markSessionCompleted`
- 中断：`markSessionCancelled`
- 未捕获错误：`markSessionError`

## 4. 多 Handbook 的生成、Remix 与切换

### 4.1 首轮生成
- `full_pipeline` 最终调用 `generate_handbook_html`
- 成功后创建新 `Handbook`，并 `setActive=true`
- 工具输出返回 `handbook_id`、`preview_url`，并在 `sourceContext` 记录最小 provenance
- 对模型与前端消息流，2.0 使用 `analyze_session_data`
- 底层持久化仍保留 `build_travel_blocks` 这个内部步骤名，但真实职责已改成 `Analyze Session Data`
- 它的主输出是 `session_analysis`
- `blocks / spotBlocks` 由 `session_analysis` 派生，仅用于兼容旧编辑器和旧展示逻辑

### 4.2 Remix
- Remix 入口优先复用 `sessionAnalysis + runtime images`
- 如果旧会话只有 `blocks`，仍通过兼容缓存继续工作
- 前端会先创建一个占位 draft handbook，再触发 `generate_handbook_html`
- 工具完成后更新这个 remix draft，并切到新的 `activeHandbookId`
- 当前实现仍复用内部 `handbook_regen` orchestration mode，但产品语义上它已经是 Remix

### 4.3 普通手动编辑
- handbook 视图提供最小手动 HTML 编辑器
- 编辑保存通过：
  - `PATCH /api/sessions/[id]/handbooks/[handbookId]`
- 本次保存只更新 handbook-level 字段（当前主要是 `html`）
- **不会** 清空 `sourceContext.sessionAnalysis / sourceBlocks / sourceSpotBlocks / sourceToolOutputs`，避免破坏后续 remix 输入
- 当前版本未接入 `Editor Agent + MCP`

### 4.4 切换
- 前端调用：`POST /api/sessions/[id]/handbooks/[handbookId]/activate`
- `Session.activeHandbookId` 更新

### 4.5 生命周期
- 前端调用：`PATCH /api/sessions/[id]/handbooks/[handbookId]/lifecycle`
- 首页与详情页都统一为 handbook 级调用（不再走旧 session 级路径）

## 5. 前端状态分层

### 5.1 `sessions-store`
- 维护会话列表与聚合字段：
  - `handbookCount/publicHandbookCount/activeHandbookId`

### 5.2 `handbooks-store`
- 按 `sessionId` 缓存 handbooks 列表
- 提供 `create/update/lifecycle/activate/delete`

### 5.3 `session-editor-store`
- 维护 `activeHandbookId`
- 维护 handbook 级 html/preview 与中间视图状态
- 当前已承担 handbook-first 默认视图投影
- 普通手动编辑的 dirty draft 目前由页面 hook 本地维护，不持久化到 store

## 6. API 清单（多 Handbook）

### 6.1 会话
- `GET/POST /api/sessions`
- `GET/PATCH/DELETE /api/sessions/[id]`
- `PATCH /api/sessions/[id]/state`
- `POST /api/sessions/[id]/cancel`

### 6.2 handbook
- `GET/POST /api/sessions/[id]/handbooks`
- `PATCH/DELETE /api/sessions/[id]/handbooks/[handbookId]`
- `POST /api/sessions/[id]/handbooks/[handbookId]/activate`
- `PATCH /api/sessions/[id]/handbooks/[handbookId]/lifecycle`

### 6.3 预览/公开
- `GET /api/guide/[id]`
- `GET /api/public/guide/[id]`

## 7. 恢复机制

会话页首屏会拉：
1. `GET /api/sessions/[id]`
2. `GET /api/sessions/[id]/handbooks`

然后：
- 恢复消息历史
- 恢复运行态 `sessionAnalysis / blocks / toolOutputs`
- 恢复 active handbook 对应的预览
- 若当前 session 已有 handbook，中心工作区默认优先进入 handbook 视图
