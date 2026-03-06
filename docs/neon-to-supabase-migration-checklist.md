# Neon -> Supabase 切换计划（Schema-Only + Vercel Env）

> 适用项目：`ai-next`  
> 更新时间：`2026-03-06`  
> 本次决策：**不迁移 Neon 历史数据**，只保留 Supabase 新结构与后续新增数据。  
> 最终目标：前端继续部署在 Vercel，数据库改为  
> - `Development` / `Preview` / 本地：`tabi-ai-dev`  
> - `Production`：`tabi-ai-prod`

---

## 0. 基线与决策（已确认）

- [x] B1 应用与 Prisma 都读取 `DATABASE_URL`（运行时与 CLI 一致）。
- [x] B2 `supabase-js` 未接入，`project URL / anon / service_role` 当前不是切库必需项。
- [x] B3 本地敏感信息文件已建立并忽略：`docs/supabase-secrets.local.md`。
- [x] B4 环境映射已确定：
  - `Vercel Production` -> `tabi-ai-prod`
  - `Vercel Preview` -> `tabi-ai-dev`
  - `Vercel Development` -> `tabi-ai-dev`
  - 本地 `.env.local` -> `tabi-ai-dev`
- [x] B5 决策变更：放弃 Neon 历史全量迁移（包括 dev/prod）。

---

## 1. Schema 状态（已完成）

- [x] S1 `tabi-ai-dev`：Prisma schema 已同步完成（`prisma db push` 成功）。
- [x] S2 `tabi-ai-dev`：核心链路 smoke 通过（登录/创建 session/生成 handbook）。
- [x] S3 `tabi-ai-prod`：Prisma schema 已同步完成（`prisma db push` 成功）。
- [x] S4 `tabi-ai-prod`：关键表存在且当前为空（符合“新库起步”预期）。

当前观测（2026-03-06）：

- `tabi-ai-dev`：`User=2 / Session=1 / Handbook=1 / SessionState=1 / ChatMessage=2 / SessionStep=8`
- `tabi-ai-prod`：`User=0 / Session=0 / Handbook=0 / SessionState=0 / ChatMessage=0 / SessionStep=0`

---

## 2. 现在的主线任务（Env Cutover）

> 这部分是你当前真正要执行的切换主线。

- [x] E1 已在 Vercel 设置 `DATABASE_URL`（2026-03-06）：
  - `Production` = `PROD_DATABASE_URL`（`tabi-ai-prod` pooler）
  - `Preview` = `DEV_DATABASE_URL`（`tabi-ai-dev` pooler）
  - `Development` = `DEV_DATABASE_URL`（`tabi-ai-dev` pooler）
- [x] E2 已在 Vercel 设置 `DIRECT_URL`（2026-03-06）：
  - `Production` = `PROD_DIRECT_URL`
  - `Preview` = `DEV_DIRECT_URL`
  - `Development` = `DEV_DIRECT_URL`
- [ ] E3（可选）若后续启用 Supabase API，再设置：
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`（仅服务端）
- [x] E4 已执行 `vercel env pull .env.development.local`（2026-03-06），本地 Development 已与 `tabi-ai-dev` 对齐。

执行证据（2026-03-06）：

- 远端快照备份：`backups/env/vercel-remote-20260306-123059`
- 最终映射复核（通过 `vercel env pull`）：
  - `development` -> `DATABASE_URL=tabi-ai-dev` / `DIRECT_URL=tabi-ai-dev`
  - `preview` -> `DATABASE_URL=tabi-ai-dev` / `DIRECT_URL=tabi-ai-dev`
  - `production` -> `DATABASE_URL=tabi-ai-prod` / `DIRECT_URL=tabi-ai-prod`

---

## 3. 发布顺序（先 Preview 再 Production）

- [x] R1 已触发 Preview 部署（2026-03-06）：
  - Preview URL: `https://tabi-bk1zj7t48-skyscraperno1.vercel.app`
  - Deployment: `dpl_6HAqTuCCWumcmjYEtShzm7LBVPMe`
- [x] R2 已验证 Preview（2026-03-06）：
  - 说明：Preview 开启了 Vercel Deployment Protection，验证使用 `vercel curl`（认证绕过）
  - 注册成功：`201`
  - 创建 session 成功：`201`
  - handbook 生成成功：`HANDBOOK_COUNT=1`
  - 样本 session：`cmmegdzjo000004l83hgh019u`
- [x] R3 已触发 Production 部署（2026-03-06）：
  - Production deployment URL: `https://tabi-k6lpv05g5-skyscraperno1.vercel.app`
  - Alias: `https://tabi-ai.vercel.app`
- [x] R4 验证 Production（至少 30 分钟）：
  - 错误率无明显升高
  - 数据库连接稳定
  - 接口延迟在可接受范围
  - 当前状态：按本轮决策可暂不执行完整 30 分钟观察；已完成 0-5 分钟即时 smoke（见 `C1-C4`）
  - 观测补充（2026-03-06）：`vercel logs --environment production --since 15m --status-code 500 --no-follow --no-branch` 返回 `No logs found`

---

## 4. 本地配置目标状态

- [x] L1 `.env.local` 已指向 `tabi-ai-dev`（用于本地开发）。
- [ ] L2 `.env.production.local` 是否切到 `tabi-ai-prod`（用于本机模拟生产）：
  - 建议：如果你会在本机跑 `NODE_ENV=production` 进行验证，则切到 Supabase prod。
  - 如果不用本机模拟生产，可暂不改此文件。

---

## 5. 切换后验收（必须打勾）

- [x] C1 `https://tabi-ai.vercel.app/login` 可访问（`200`）。
- [x] C2 新用户注册可写入 `User`（production smoke `REG_CODE=201`）。
- [x] C3 新建 session、写 message、更新 session 状态都成功（production smoke `SESSION_CODE=201`）。
- [x] C4 生成 handbook 后，`SessionState` / `Handbook` / `SessionStep` 都有新增记录（`HANDBOOK_COUNT=1`）。

production smoke 证据（2026-03-06）：

- 样本 session：`cmmegkwyr000004jr1pkrdnuc`
- 注册：`201`
- `/api/auth/me`：`200`
- `/api/chat`：`200`
- `/api/sessions/{id}/handbooks`：`200`（`count=1`）

---

## 6. 回滚预案（保留）

- [ ] RB1 记录当前 Neon 连接串（仅本地安全文档保存）。
- [ ] RB2 若线上异常：把 Vercel `Production` 的 `DATABASE_URL` / `DIRECT_URL` 改回 Neon。
- [ ] RB3 重新部署 Production 使回滚生效。
- [ ] RB4 回滚后暂停发布，定位后再二次切换。

---

## 7. 历史数据补回（可选，不影响本次上线）

- 可选脚本：`scripts/run-neon-to-supabase-dev-backfill.sh`
- 当前阻塞：Neon `data transfer quota exceeded`
- 这条支线不影响本次 “切库上线” 主目标

---

## 8. 连接注意事项（Prisma + Supabase）

- 运行时优先用 pooler：`DATABASE_URL`
- 迁移/导入优先用 direct：`DIRECT_URL`
- 当前网络环境下 direct host 可能握手不稳定，已验证可用 pooler 完成 schema push
- 本次切换已在 Vercel 与本地 `DATABASE_URL` 统一追加：
  - `sslmode=require&uselibpqcompat=true`
