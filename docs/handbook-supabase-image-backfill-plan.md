# 旧数据图片回填 Supabase 方案（一次性脚本）

## 0. Review / 执行勾选清单

> 用法：确认一项完成后，把 `- [ ]` 改成 `- [x]`。

### 0.1 Review 决策项（先确认）

- [x] 确认 `Handbook.html` 回填范围：仅 `Unsplash + data URL` 
- [x] 确认失败策略： 全局中断

### 0.2 实施阶段（脚本）

- [x] 新增脚本：`scripts/backfill-handbook-images-to-supabase.mjs`
- [x] 支持 `--dry-run`
- [x] 支持幂等重跑（已迁移 URL 跳过）
- [x] 输出统计（扫描数、上传成功/失败、更新记录数）

### 0.3 验收阶段

- [x] `SessionState.context.handbookImages[].image_url` 无 Unsplash/base64 残留
- [x] `SessionState.toolOutputs` 中相关 `images[].image_url` 无 Unsplash/base64 残留
- [x] `Handbook.sourceContext/sourceToolOutputs` 中图片 URL 完成替换
- [x] `Handbook.html` 中目标范围图片 URL 完成替换

## 1. 背景与目标

当前历史数据里存在两类图片 URL：

1. Unsplash 外链 URL
2. Imagen base64 Data URL

目标是通过一次性脚本批量迁移到 Supabase Storage，并更新数据库中对应 JSON 和 HTML 字段。

## 2. 扫描范围

建议处理以下字段：

1. `SessionState.context.handbookImages[].image_url`
2. `SessionState.toolOutputs` 中可能存在的 `images[].image_url`
3. `Handbook.sourceContext` 中图片 URL
4. `Handbook.sourceToolOutputs` 中图片 URL
5. `Handbook.html` 中 `<img src="...">`

数据入口参考：`src/server/sessions.ts`、`prisma/schema.prisma`。

## 3. 识别规则

候选 URL 满足任一：

- `data:image/`
- `http://` 或 `https://` 且域名为 `unsplash.com` / `*.unsplash.com`，并且不是当前 Supabase bucket URL

跳过：

- 已是当前 Supabase URL
- 空值或明显非图片链接

## 4. 上传与替换策略

## 4.1 上传

- 复用运行时方案中的服务端存储函数（同一规则）。
- 路径建议使用：
  - `handbooks/{sessionId}/{handbookId_or_runtime}/{sha1}.{ext}`
  - 回填场景中，`handbookId_or_runtime` 固定使用 `handbookId`
- 实现细节建议：
  - `sha1` 基于图片二进制内容计算（不是 URL）。
  - `ext` 从 `content-type` 推导（例如 `jpg/png/webp`）。
  - 上传时如果同路径已存在，按“已存在即复用 URL”处理，保证幂等。

## 4.2 替换

- 使用 `Map<oldUrl, newUrl>` 做单次运行内去重。
- 命中映射后统一替换 JSON/HTML。

## 4.3 更新粒度

- 按 `session` / `handbook` 分批更新。
- 单记录失败不影响后续记录（推荐）。

## 5. 脚本参数与输出

## 5.1 参数

- `--dry-run`：仅扫描与统计，不写库不上传。
- `--session-id=<id>`：可选，先小范围验证。
- `--limit=<n>`：可选，限制扫描数量。

## 5.2 输出统计

- 扫描 session 数
- 扫描 handbook 数
- 发现待迁移 URL 数
- 上传成功/失败数
- 更新记录数（按表/字段拆分）

## 6. 幂等与重跑

1. 已是 Supabase URL 的 URL 直接跳过。
2. 同一旧 URL 在同次运行仅上传一次。
3. 多次运行不会重复迁移已完成项。

## 7. 环境变量

- `DATABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET=handbook`

## 8. 执行建议

1. 先 `--dry-run` 获取影响范围。
2. 选 1~3 个 session 小范围执行。
3. 人工检查 handbook 预览与 JSON 数据。
4. 再全量执行。

## 9. 本次执行结果（2026-03-12）

### 9.1 小范围验证

- 命令：`npm run backfill:handbook-images -- --session-id mmm6aahm-y9vdzc`
- 结果：`status=ok`，该会话无剩余待迁移 URL（`candidateUrlsFound=0`）。

### 9.2 全量执行（apply）

- 命令：`npm run backfill:handbook-images`
- 输出统计：
  - `status: ok`
  - `sessionsScanned: 13`
  - `handbooksScanned: 19`
  - `candidateUrlsFound: 232`
  - `uniqueUploadsTried: 147`
  - `uploadSuccessCount: 147`
  - `uploadReuseCount: 85`
  - `uploadFailureCount: 0`
  - `referencesReplaced: 232`
  - `sessionStateUpdated: 10`
  - `handbookJsonUpdated: 1`
  - `handbookHtmlUpdated: 16`

### 9.3 全量验收（dry-run）

- 命令：`npm run backfill:handbook-images -- --dry-run`
- 输出统计：
  - `status: ok`
  - `candidateUrlsFound: 0`
  - `sessionStateWouldUpdate: 0`
  - `handbookJsonWouldUpdate: 0`
  - `handbookHtmlWouldUpdate: 0`

结论：本次回填目标范围（`Unsplash + data URL`）已迁移完成，且可幂等重跑。

## 10. Prod 执行记录模板（待填写）

> 用法：复制本节，改标题日期后填写；每完成一步把 `- [ ]` 改成 `- [x]`。

### 10.1 环境确认

- [x] 已加载 `.env.production.local`（不是 dev）
- [x] 已确认 `DATABASE_URL` 指向 prod
- [x] 已确认 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET` 为 prod

建议命令：

```bash
( set -a; source .env.production.local; set +a; env | rg 'DATABASE_URL|NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET' )
```

### 10.2 全量预检（dry-run）

- [x] 已执行 dry-run
- [x] dry-run 返回 `status: ok`

命令：

```bash
( set -a; source .env.production.local; set +a; npm run backfill:handbook-images -- --dry-run | tee /tmp/backfill-prod-dry-run.json )
```

记录结果（填写）：

- `sessionsScanned: 12`
- `handbooksScanned: 12`
- `candidateUrlsFound: 194`

### 10.3 小范围金丝雀（apply）

- [x] 已对 1~3 个 prod session 执行 `--session-id`
- [x] `uploadFailureCount = 0`
- [x] UI 抽查通过（Block/Cover 图片可访问）

命令：

```bash
( set -a; source .env.production.local; set +a; npm run backfill:handbook-images -- --session-id cmmegkwyr000004jr1pkrdnuc | tee /tmp/backfill-prod-canary-cmmegkwyr000004jr1pkrdnuc.json )
```

记录结果（填写）：

- `status: ok`
- `candidateUrlsFound: 12`
- `uploadFailureCount: 0`
- 抽查方式：从 `SessionState.context.handbookImages[0].image_url` 取样验证，HTTP `200`。

### 10.4 全量执行（apply）

- [x] 已执行全量 apply
- [x] 返回 `status: ok`
- [x] `uploadFailureCount = 0`（或记录失败并完成重跑）

命令：

```bash
( set -a; source .env.production.local; set +a; npm run backfill:handbook-images | tee /tmp/backfill-prod-apply.json )
```

记录结果（填写）：

- `sessionsScanned: 11`
- `handbooksScanned: 11`
- `candidateUrlsFound: 10`
- `uniqueUploadsTried: 10`
- `uploadSuccessCount: 7`
- `uploadReuseCount: 3`
- `uploadFailureCount: 0`
- `referencesReplaced: 10`
- `sessionStateUpdated: 0`
- `handbookJsonUpdated: 0`
- `handbookHtmlUpdated: 1`

### 10.5 全量验收（dry-run）

- [x] 已执行验收 dry-run
- [x] `candidateUrlsFound = 0`
- [x] `sessionStateWouldUpdate = 0`
- [x] `handbookJsonWouldUpdate = 0`
- [x] `handbookHtmlWouldUpdate = 0`

命令：

```bash
( set -a; source .env.production.local; set +a; npm run backfill:handbook-images -- --dry-run | tee /tmp/backfill-prod-verify.json )
```

记录结果（填写）：

- `candidateUrlsFound: 0`
- `sessionStateWouldUpdate: 0`
- `handbookJsonWouldUpdate: 0`
- `handbookHtmlWouldUpdate: 0`

### 10.6 异常与重跑记录

- [x] 如发生中断，已记录错误摘要
- [x] 已执行重跑并收敛

备注（填写）：

- 错误摘要：`Supabase upload failed ... Bad Gateway (502)，首次全量 apply 中断。`
- 重跑命令：`( set -a; source .env.production.local; set +a; npm run backfill:handbook-images | tee /tmp/backfill-prod-apply-retry1.json )`
- 重跑后结果：`status=ok，uploadFailureCount=0，随后 verify dry-run candidateUrlsFound=0。`
