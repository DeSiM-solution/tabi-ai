# 新生成 Handbook 图片落盘 Supabase 方案（运行时）

> 更新（2026-03-16）：canonical URL 入口已前移到 `search_image` / `generate_image`。本文件中的 `generate_handbook_html` 上传闸口仍保留，但现在主要作为历史数据和异常输入的兜底保护。

## 0. Review / 执行勾选清单

> 用法：确认一项完成后，把 `- [ ]` 改成 `- [x]`。

### 0.1 Review 决策项（先确认）

- [x] 确认对象路径采用：`handbooks/{sessionId}/{handbookId_or_runtime}/{sha1}.{ext}`
- [x] 确认图片转换失败策略: 跳过失败继续

### 0.2 实施阶段（代码）

- [x] 新增服务端图片存储模块：`src/server/handbook-image-storage.ts`
- [x] 在 `generate_handbook_html` 前接入统一上传闸口（覆盖 Unsplash URL + base64）
- [x] `ctx.runtime.latestHandbookImages` 在 HTML 生成前替换为 Supabase URL
- [x] `persistSessionSnapshot` 写入后的 `context.handbookImages` 为 Supabase URL

### 0.3 验收阶段（对应 checklist 1.1-1）

- [x] 新生成 handbook 的图片 URL 全部指向 Supabase
- [x] 生成 HTML 不再包含 `data:image/`
- [x] 刷新会话后预览正常（图片可访问）

## 1. 背景与目标

针对新生成 handbook，目标是在 `generate_handbook_html` 阶段统一落盘图片到 Supabase，避免：

1. HTML 直接引用 Unsplash 外链。
2. HTML 保留 `data:image/...;base64,...`。

本方案仅覆盖运行时生成链路，不包含历史数据修复（历史修复见单独文档）。

## 2. 现状（运行时链路）

### 2.1 图片来源

- `search_image` 产出 `image_url`，主路径为 Unsplash URL，fallback 可能为 base64
  - `src/agent/tools/search-image.ts`
- `generate_image` 产出 `image_url`，为 base64
  - `src/agent/tools/generate-image.ts`
  - 生成逻辑：`src/agent/tools/shared.ts` 的 `generateHandbookImageByPrompt`

### 2.2 HTML 消费

- `generate_handbook_html` 使用 `ctx.runtime.latestHandbookImages[].image_url` 生成 HTML
  - `src/agent/tools/generate-handbook-html.ts`
- 当前行为允许最终 HTML 仍含 `data:image/`。

## 3. 设计原则

1. 单入口：统一在 `generate_handbook_html` 前处理，不在 `search_image/generate_image` 分散上传。
2. 幂等：已是目标 Supabase URL 的图片跳过上传。
3. 最小改动：保留现有字段结构，仅替换 `image_url`。

## 4. 运行时改造方案

## 4.1 新增模块

新增：`src/server/handbook-image-storage.ts`

建议函数：

1. `isSupabaseStorageUrl(url: string): boolean`
2. `materializeImageSource(urlOrDataUrl: string): Promise<{ buffer: Buffer; contentType: string; extension: string }>`
3. `uploadImageBufferToSupabase(input): Promise<{ path: string; publicUrl: string }>`
4. `normalizeHandbookImagesToStorage(input): Promise<{ images: HandbookImageAsset[]; replacedCount: number }>`

## 4.2 对象路径规范

`handbooks/{sessionId}/{handbookId_or_runtime}/{sha1}.{ext}`

说明：

- `sessionId`：满足“按 session 分目录”。
- `handbookId_or_runtime`：
  - 若请求带 `handbookId`，用 `handbookId`
  - 否则用 `runtime-{timestamp}`
- `sha1`：按图片内容哈希，支持去重和幂等。

### 4.2.1 实现细节建议

- `sha1` 基于图片二进制内容计算（不是 URL）。
- `ext` 从 `content-type` 推导（例如 `jpg/png/webp`）。
- 上传时如果同路径已存在，按“已存在即复用 URL”处理，保证幂等。

## 4.3 接入点

在 `src/agent/tools/generate-handbook-html.ts`：

1. `preparedImages` 计算完成后、模型调用前执行 `normalizeHandbookImagesToStorage`。
2. 用返回数组覆盖 `ctx.runtime.latestHandbookImages`。
3. 后续 prompt 与 HTML 仅使用 Supabase URL。
4. `persistSessionSnapshot` 保持不变，自动落到 `SessionState.context.handbookImages`。

## 4.4 错误策略

已采用：单图上传失败时跳过该图上传并继续生成（保留原始图片 URL）。

补充：

- 若全部图片都失败，仍会中断，避免生成无图 handbook。

## 5. 环境变量

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET=handbook`

注意：

- `SUPABASE_SERVICE_ROLE_KEY` 仅服务端使用。

## 6. 交付与验证

验证点：

1. 生成一次 handbook，检查 `SessionState.context.handbookImages[].image_url`。
2. 打开预览 `/api/guide/{handbookId}`，确认 HTML 不含 `data:image/`。
3. 刷新 session 页面，预览图片仍正常。
