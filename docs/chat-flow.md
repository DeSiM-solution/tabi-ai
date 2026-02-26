# Chat / Tool 执行流（当前实现）

本文是当前代码真实行为的流程说明，覆盖：请求入口、tools 顺序、模型路由、数据库持久化、前端展示。

## 1. 从页面到 `/api/chat`

### 1.1 首条输入
- 页面：`src/app/session/[id]/page.tsx`
- 用户输入会先走 `toGuidePrompt`：
- 如果输入是 YouTube URL，会规范化为：
- `Create a travel guide from this video: <normalized-url>`
- 否则保留原文本

### 1.2 自动发首条消息
- 当路由带 `?initial=...` 时，页面会自动 `sendMessage`
- 用 `sessionStorage` dedupe，避免刷新后重复触发
- 发送后 `router.replace(pathname)` 清掉 `initial`

### 1.3 请求参数
- `POST /api/chat`
- body: `{ sessionId, messages }`

## 2. 后端主编排（`src/app/api/chat/route.ts`）

### 2.1 编排引擎
- `streamText` + tool calling
- `stopWhen: stepCountIs(9)`
- orchestration 模型任务：`chat_orchestration`

### 2.2 运行时缓存（单请求内）
- `videoCache`
- `latestBlocks`
- `latestSpotBlocks`
- `latestVideoContext`
- `latestApifyVideos`
- `latestHandbookImages`
- `latestImageMode`
- `latestHandbookHtml`
- `latestToolOutputs`

### 2.3 开始时会先恢复已持久化状态
- 读取 `SessionState` 快照（若存在）：
- 恢复 blocks、spotBlocks、toolOutputs、HTML、context
- 恢复图片模式（优先用 `generate_handbook_html.image_mode`）
- 这样可支持中断后继续生成，不必从头跑

## 3. Tool 顺序规则

系统提示中强约束：
1. `parse_youtube_input`
2. `crawl_youtube_videos`
3. `build_travel_blocks`
4. `resolve_spot_coordinates`（仅 spot 存在时）
5. `search_image` 或 `generate_image`（二选一，必须先于 HTML）
6. `generate_handbook_html`

附加约束：
- 坐标只能来自地理编码，不允许模型直接编造
- block type 只能是：`food | spot | transport | shopping | other`
- 生成 handbook 前必须先完成一个图片步骤

## 4. 每个 Tool 的职责与输入输出

### 4.1 `parse_youtube_input`
- 输入：`{ userText: string }`
- 行为：正则提取并去重 YouTube URL
- 输出：`{ videoUrls: string[], count: number }`

### 4.2 `crawl_youtube_videos`
- 输入：`{ videoUrls?: string[]; userText?: string }`
- 行为：
1. 合并显式 URL + 从文本提取 URL
2. 调用 Apify actor 抓视频信息和字幕
3. 写入 `videoCache` + `latestVideoContext` + `latestApifyVideos`
4. 同步 session 标题（优先抓取到的视频标题）
- 输出：`{ actorId, requestedUrls, count, videos[] }`
- `videos[]` 会包含 `thumbnailUrl`（优先 Apify 的 `thumbnailUrl`，必要时回退到 `thumbnails[]`）

### 4.3 `build_travel_blocks`
- 输入：`{ videoId?: string }`
- 行为：
1. 选定目标视频
2. 截断 subtitle/description 到安全长度
3. 调用 `runStructuredTask(task='json_compilation_strict')`
4. 做本地业务校验 + sanitize（重置 block_id、location 置空、清理 tags）
- 输出：`{ videoId, videoUrl, title, thumbnailUrl, blockCount, blocks, spot_blocks, spotCount }`

关键校验：
- blocks 数量 4~16
- block_id 非空且唯一
- title/description 非空
- 该阶段 location 必须是 `null`
- `spot_blocks` 必须严格对应 `blocks` 中的 `type=spot`

### 4.4 `resolve_spot_coordinates`
- 输入：`{}`
- 行为：
1. 先调用 `runStructuredTask(task='spot_query_normalization')` 产 geocode query
2. 调 Nominatim 查坐标
3. 失败时追加 `videoContext.location` 再试一次
4. 把坐标回填到 `latestBlocks`
- 输出：`{ spot_queries, resolved_count, unresolved_count, spots_with_coordinates, blocks, spot_blocks }`

### 4.5 `search_image`
- 输入：`{ count?: 1..6 }`
- 行为：
1. 从 blocks 里挑图像目标（优先 spot/food/...）
2. 调 `runStructuredTask(task='handbook_image_query_planning')` 生成 Unsplash 查询计划
3. 调 Unsplash API 拉真实图片
4. 优先保存为 `source='unsplash'`（失败时回退为 `source='imagen'`）
- 输出：`{ mode, planner_model, image_count, images[] }`

说明：
- 不再使用 `source.unsplash.com/featured` 作为兜底（该链接不稳定且容易裂图）。
- 当 Unsplash API 不可用、限流或无结果时，会在 `search_image` 内自动回退到 Imagen 生成，`images[].source` 会标记为 `imagen`。

### 4.6 `generate_image`
- 输入：`{ count?: 1..6 }`
- 行为：
1. 同样先做图像计划（`handbook_image_query_planning`）
2. 对每个 block 用 Google 图像模型生成图
3. 模型候选按顺序尝试：
- `HANDBOOK_IMAGE_MODEL`（默认 `imagen-4.0-fast-generate-001`）
- `HANDBOOK_IMAGE_FALLBACK_MODEL`（默认 `gemini-2.5-flash-image`）
4. 保存为 `source='imagen'`
- 输出：`{ mode, planner_model, generation_models, image_count, images[] }`

### 4.7 `generate_handbook_html`
- 输入：`{ title?, videoId?, videoUrl?, thumbnailUrl?, blocks, spot_blocks?, images? }`
- 行为：
1. 必须已有准备好的 images（来自 input 或前序 image tool）
2. 调 `runTextTask(task='handbook_html_generation')` 生成完整 HTML 文档（若有 `thumbnailUrl`，要求作为页面顶部 header/hero 图）
3. 后处理：
- 去 Markdown code fence
- 强制校验完整文档（doctype/html/body）
- 移除 video/YouTube iframe
- 若模型未渲染头图，则自动注入带 `thumbnailUrl` 的 header section（兜底）
- 在文末追加 `Watch Origin Video` 链接
4. 写入 `SessionState.handbookHtml` + `previewPath`
- 输出包含：`html`、`image_mode`、`preview_url` 等

## 5. 模型映射与回退

文件：`src/lib/model-management.ts`

- `chat_orchestration`
- 主：`deepseek-chat`
- 备：`deepseek-reasoner`

- `json_compilation_strict`
- 主：`gemini-2.5-pro`
- 备：`gemini-2.5-flash`

- `spot_query_normalization`
- 主：`gemini-2.5-flash`
- 备：`gemini-2.5-flash-lite`

- `handbook_image_query_planning`
- 主：`gemini-2.5-flash`
- 备：`gemini-2.5-flash-lite`

- `handbook_html_generation`
- 主：`gemini-3-pro-preview`
- 备：`gemini-2.5-pro`

策略：
- 结构化任务：`generateObject` + schema 校验 + 业务校验 + 重试 + fallback
- 文本任务：`generateText` + 重试 + fallback

## 6. 持久化时机（很关键）

### 6.1 消息
- 请求开始：`upsertChatMessages(sessionId, messages)`
- 请求结束：`upsertChatMessages(sessionId, finalMessages)`

### 6.2 步骤
- 每个 tool 执行前：`createSessionStep`
- 成功：`completeSessionStep`
- 失败：`failSessionStep`
- 取消：`cancelSessionStep`

### 6.3 快照
- 每个步骤成功后 `upsertSessionState`：
- `context/blocks/spotBlocks/toolOutputs`
- 有 HTML 时额外写 `handbookHtml/previewPath`
- HTML 正式生成时 `incrementHandbookVersion: true`

### 6.4 前端编辑回写
- 编辑器自动保存调用：`PATCH /api/sessions/[id]/state`
- 可回写：`blocks/spotBlocks/toolOutputs/handbookHtml/previewPath`

## 7. 前端展示与交互规则

### 7.1 消息渲染
文件：`src/app/session/[id]/_components/message-content.tsx`

- 用户消息：纯文本渲染（不走 markdown）
- assistant/system 文本：`react-markdown` + `remark-gfm`
- tool part：渲染 ToolCard（状态、摘要、关键 JSON）

### 7.2 首句 sticky
文件：`src/app/session/[id]/page.tsx`

- 第一条用户文本会固定在聊天区顶部 sticky 展示
- 消息列表中会跳过这条重复渲染

### 7.3 Blocks 自动打开
- 当检测到可编辑 tool 输出（当前仅 `resolve_spot_coordinates`）时
- 自动创建 `editorSession` 并切到 `blocks` 视图，无需手动点 `Edit blocks`

### 7.4 HTML/Blocks 双态
- 中间区域有 `Blocks | HTML` 切换
- 已生成 HTML 后，只做视图切换，不需要每次重新生成

### 7.5 HTML 预览容器
- 使用 iframe（`src` 或 `srcDoc`）加载
- 外层是 mac 风格窗口壳
- 设备切换：
- Desktop: 容器宽度 720
- Mobile: 容器宽度 375

### 7.6 右侧面板
文件：`src/app/session/[id]/layout.tsx`

- 右侧聊天面板支持拖拽宽度：`300 ~ 600px`
- 工具栏 `Share` 为复制当前链接（复制成功/失败提示）
- 取消 `Publish` 按钮

## 8. 失败、取消、完成语义

- 用户点 Stop：
- 前端 `stop()` 中断流
- 调 `/api/sessions/[id]/cancel`
- 会话状态标记为 `CANCELLED`

- tool 失败：
- `SessionStep = ERROR`
- `Session.status = ERROR`，并记录 `failedStep/lastError`

- 正常结束：
- `markSessionCompleted`
- summary 显示最终时间（基于 `startedAt ?? createdAt`）

## 9. 常见排查点

1. `Expected SessionToolName`
- DB enum 未同步，执行 `npm run prisma:push`

2. `generate_handbook_html` 报缺图
- 必须先跑 `search_image` 或 `generate_image`

3. 预览地址不一致
- 统一以 `/api/guide/<sessionId>` 为主，`/api/handbook/<sessionId>` 仅兼容旧路径
