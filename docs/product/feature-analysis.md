# Tabi AI - Feature Analysis

> Tabi AI: YouTube Travel Videos to Premium Travel Guide Handbooks

## Project Overview

Tabi AI 是一个全栈 Web 应用，通过 AI Agent 编排，将 YouTube 旅行视频转化为精美的旅行指南手册（Handbook）。用户只需粘贴一个 YouTube 链接，系统便会自动抓取视频信息、提取旅行地点、地理编码、搜索/生成配图，最终输出一份响应式 HTML 旅行手册。

## Tech Stack

| 层级 | 技术 |
|------|------|
| 前端框架 | Next.js 16 + React 19 + TypeScript |
| 样式 | Tailwind CSS v4 |
| 状态管理 | Zustand |
| 后端 | Next.js API Routes (Node.js) |
| 数据库 | PostgreSQL + Prisma ORM |
| AI/LLM | DeepSeek API, Google Gemini, Google Imagen |
| 外部服务 | Apify (YouTube 抓取), Unsplash (图片搜索), Nominatim (地理编码) |

---

## Core Features

### 1. YouTube 视频解析与抓取

**功能描述：** 用户输入 YouTube 视频链接，系统自动提取视频元数据和字幕内容。

**技术实现：**
- 使用正则表达式从用户输入中提取 YouTube URL
- 通过 Apify YouTube Scraper Actor 抓取视频数据
- 获取内容包括：标题、时长、缩略图、位置信息、字幕、描述、观看量等

**相关文件：**
- `src/agent/tools/parse-youtube-input.ts` — URL 提取
- `src/agent/tools/crawl-youtube-videos.ts` — Apify 视频抓取

---

### 2. 旅行内容块（Travel Blocks）提取

**功能描述：** 利用 AI 将视频字幕和元数据转化为结构化的旅行内容块。

**内容块类型：**
- `food` — 美食推荐
- `spot` — 景点/地点
- `transport` — 交通信息
- `shopping` — 购物推荐
- `other` — 其他

**每个内容块包含：**
- `block_id` — 唯一标识
- `title` — 标题
- `description` — 描述
- `location` — 经纬度坐标（可选）
- `smart_tags` — 智能标签

**技术实现：**
- 使用 Google Gemini 2.5 Pro 进行 JSON 结构化提取
- Zod Schema 验证 + 业务规则校验（4-16 个 blocks，唯一 block_id 等）

**相关文件：**
- `src/agent/tools/build-travel-blocks.ts`
- `src/agent/prompts/build-travel-blocks.ts`
- `src/agent/tools/types.ts` — 数据 Schema 定义

---

### 3. 地理编码（Geocoding）

**功能描述：** 自动为提取的地点信息添加经纬度坐标。

**技术实现：**
- 通过 Gemini 进行查询规范化（将模糊地点名转为精确搜索词）
- 调用 Nominatim（OpenStreetMap）API 进行地理编码
- 失败时自动追加视频位置上下文进行重试

**用户交互：** 地理编码完成后，前端自动打开内容块编辑器，用户可手动调整坐标。

**相关文件：**
- `src/agent/tools/resolve-spot-coordinates.ts`
- `src/agent/prompts/resolve-spot-coordinates.ts`

---

### 4. 图片搜索与生成（双模式）

**功能描述：** 为旅行内容块匹配或生成配图。

#### 模式 A: Unsplash 图片搜索
- 通过 Gemini 规划搜索关键词
- 调用 Unsplash API 搜索真实照片
- 返回含版权信息的高质量图片

#### 模式 B: AI 图片生成
- 通过 Gemini 规划生成提示词
- 调用 Google Imagen API 生成自定义旅行图片
- 模型回退策略：`imagen-4.0-fast-generate-001` → `gemini-2.5-flash-image`

**相关文件：**
- `src/agent/tools/search-image.ts`
- `src/agent/tools/generate-image.ts`
- `src/agent/prompts/image-query-planning.ts`

---

### 5. HTML 旅行手册生成

**功能描述：** 将所有收集的数据（内容块 + 坐标 + 图片）整合为一份完整的响应式 HTML 旅行手册。

**技术实现：**
- 使用 Google Gemini 3 Pro Preview 生成 HTML
- 后处理：移除视频嵌入、规范文档结构、自动注入缩略图
- 附加"观看原始视频"链接
- 单文件 HTML，内含完整 CSS，兼容桌面端和移动端

**5 种手册风格：**

| 风格 | 描述 |
|------|------|
| Minimal Tokyo | 日式极简，大量留白，克制 |
| Warm Analog | 纸质感，复古旅行杂志风 |
| Brutalist | 高对比度，粗体，几何 |
| Dreamy Soft | 柔和渐变，空灵，优雅 |
| Let Tabi Decide | 系统自动选择 |

**相关文件：**
- `src/agent/tools/generate-handbook-html.ts`
- `src/agent/prompts/handbook-html.ts`
- `src/lib/handbook-style.ts`

---

### 6. 内容块编辑器（Block Editor）

**功能描述：** 可视化编辑 AI 提取的旅行内容块。

**编辑能力：**
- 修改标题、描述
- 调整经纬度坐标
- 管理智能标签（添加/删除）
- 添加/删除内容块

**自动保存：** 编辑内容每 900ms 自动保存到服务端。

**相关文件：**
- `src/app/session/[id]/_components/block-editor-workspace.tsx`
- `src/app/session/[id]/_stores/session-editor-store.ts`
- `src/app/session/[id]/_lib/chat-utils.ts`

---

### 7. 实时聊天与工具可视化

**功能描述：** 右侧面板展示 AI Agent 的实时执行过程。

**特性：**
- 流式消息展示（SSE）
- 工具执行卡片（工具名 + 状态徽章 + JSON 数据面板）
- 状态徽章：Running / Success / Error
- Markdown 渲染的助手消息
- 可编辑的工具输出（如内容块编辑）

**相关文件：**
- `src/app/session/[id]/_components/message-content.tsx`
- `src/app/session/[id]/page.tsx`

---

### 8. Session 管理

**功能描述：** 完整的会话生命周期管理。

**Session 状态流转：**
```
IDLE → RUNNING → COMPLETED
                → ERROR
                → CANCELLED
```

**功能：**
- 创建 / 查看 / 更新 / 删除 Session
- 侧边栏展示历史 Session 列表
- Session 重命名
- 取消运行中的 Session
- 自动刷新（30 秒 TTL，窗口聚焦时触发）

**相关文件：**
- `src/server/sessions.ts` — Session CRUD
- `src/server/events.ts` — 事件处理（消息、步骤、状态）
- `src/stores/sessions-store.ts` — 客户端状态
- `src/stores/session-store.ts` — 单 Session 进程状态

---

### 9. 手册预览与分享

**功能描述：** 在应用内预览生成的旅行手册。

**特性：**
- 桌面端 (720px) / 移动端 (375px) 切换预览
- HTML 实时渲染
- 下载手册功能
- 分享链接（永久链接）
- 独立预览路由：`/api/guide/[id]`

---

## AI Agent 编排架构

### 工具执行顺序（严格有序）

```
1. parse_youtube_input     → 提取 YouTube URL
2. crawl_youtube_videos    → 抓取视频数据
3. build_travel_blocks     → 生成旅行内容块
4. resolve_spot_coordinates → 地理编码
5. search_image / generate_image → 图片处理
6. generate_handbook_html  → 生成 HTML 手册
```

系统通过 System Prompt 强制执行顺序，防止工具乱序调用。最大执行步数：9 步。

### 模型路由策略

| 任务 | 主模型 | 回退模型 |
|------|--------|----------|
| 聊天编排 | DeepSeek Chat | DeepSeek Reasoner |
| JSON 结构化提取 | Gemini 2.5 Pro | Gemini 2.5 Flash |
| 查询规范化 | Gemini 2.5 Flash | Gemini 2.5 Flash Lite |
| 图片搜索规划 | Gemini 2.5 Flash | Gemini 2.5 Flash Lite |
| HTML 生成 | Gemini 3 Pro Preview | Gemini 2.5 Pro |

### 状态持久化策略

- **请求开始：** 从 DB 恢复缓存状态（blocks, images, context）
- **每个工具执行后：** 持久化当前快照到 DB
- **编辑器自动保存：** 900ms 防抖 → PATCH `/api/sessions/[id]/state`
- **中断恢复：** 可从失败步骤恢复，无需重新开始

---

## 数据模型

### Session

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | CUID 主键 |
| title | string | Session 标题 |
| status | enum | IDLE / RUNNING / COMPLETED / ERROR / CANCELLED |
| currentStep | enum? | 当前执行的工具 |
| failedStep | enum? | 失败的工具 |
| lastError | string? | 最后错误信息 |

### ChatMessage

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 主键 |
| sessionId | string | 外键 |
| role | enum | USER / ASSISTANT / SYSTEM / TOOL |
| text | string? | 提取的文本内容 |
| parts | JSON | 完整消息部分 |

### SessionState

| 字段 | 类型 | 说明 |
|------|------|------|
| sessionId | string | 主键 + 外键 |
| context | JSON | 视频上下文 + Apify 结果 |
| blocks | JSON | 旅行内容块 |
| spotBlocks | JSON | 地点内容块 |
| handbookHtml | string? | 生成的 HTML |

---

## UI/UX 设计

### 页面布局

**首页 (`/`)：**
- 左侧：可折叠的 Session 列表侧边栏
- 中央：创建指南表单（YouTube URL 输入 + 风格选择）
- Hero 区域展示品牌 "Tabi"

**Session 页面 (`/session/[id]`)：**
- 三栏布局
  - 左侧：Session 列表侧边栏（280px，可折叠）
  - 中央：内容块编辑器 / HTML 预览（Tab 切换）
  - 右侧：聊天面板（300-600px，可拖拽调整宽度）

### 设计系统

**字体：**
- Body: Inter (含 Noto Sans JP 回退)
- Monospace: JetBrains Mono
- Display: Playfair Display
- Script: Dancing Script

**配色：**
- 主背景: `#FAFAF8` (暖白)
- 强调色: `#0D9488` (青绿)
- 正文色: `#2D2A26` (深棕)
- 成功: `#10B981`
- 错误: `#E11D48`

---

## User Flow

```
1. 用户访问首页
   ↓
2. 粘贴 YouTube 旅行视频链接（或选择示例视频）
   ↓
3. 选择手册风格（5 种可选）
   ↓
4. 点击 "Create My Guide"
   ↓
5. 跳转到 Session 页面，AI Agent 自动执行 7 步流程
   ├── 解析 URL
   ├── 抓取视频数据
   ├── 提取旅行内容块
   ├── 地理编码
   ├── 搜索/生成配图
   └── 生成 HTML 手册
   ↓
6. 用户可在中央面板编辑内容块（可选）
   ↓
7. 切换到 HTML 预览查看最终手册
   ↓
8. 下载或分享旅行手册
```

---

## External API Dependencies

| 服务 | 用途 | 环境变量 |
|------|------|----------|
| DeepSeek | 聊天编排 LLM | `DEEPSEEK_API_KEY` |
| Google Gemini | 结构化提取、HTML 生成 | `GOOGLE_GENERATIVE_AI_API_KEY` |
| Google Imagen | AI 图片生成 | (同上) |
| Apify | YouTube 视频抓取 | `APIFY_API_KEY` |
| Unsplash | 图片搜索 | `UNSPLASH_ACCESS_KEY` |
| Nominatim | 地理编码 (OSM) | 无需 Key |
| PostgreSQL | 数据持久化 | `DATABASE_URL` |
