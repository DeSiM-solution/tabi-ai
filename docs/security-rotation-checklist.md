# 密钥轮换（Rotation）执行单

> 项目：`ai-next`  
> 创建日期：`2026-03-05`  
> 适用场景：密钥/密码曾在聊天、截图、日志、仓库中暴露，需要立即更换并废弃旧值。  
> 执行原则：先换高权限、再换中权限、最后换低权限；每一步都要“更新变量 + 重部署 + 验证 + 作废旧值”。

---

## 0. 轮换范围（基于当前 `.env.local`）

- [ ] `DATABASE_URL*`（Neon 旧库相关连接信息，计划切换到 Supabase 后应整体淘汰）
- [ ] `AUTH_GITHUB_CLIENT_SECRET`
- [ ] `AUTH_GOOGLE_CLIENT_SECRET`
- [ ] `APIFY_API_KEY`
- [ ] `DEEPSEEK_API_KEY`
- [ ] `GOOGLE_GENERATIVE_AI_API_KEY`
- [ ] `UNSPLASH_ACCESS_KEY`
- [ ] `VERCEL_OIDC_TOKEN`（不建议长期保存在 `.env.local`）
- [ ] `SUPABASE_SERVICE_ROLE_KEY`（已在聊天中出现，必须轮换）
- [ ] `SUPABASE_ANON/PUBLISHABLE KEY`（建议一起轮换）
- [ ] Supabase DB Password（`tabi-ai-prod`、`tabi-ai-dev`）

---

## 1. 立刻止血（今天，2026-03-05）

- [ ] S1 停止继续在聊天/截图中粘贴明文密钥。
- [ ] S2 确认敏感本地文件已忽略：`docs/supabase-secrets.local.md`（已配置到 `.gitignore`）。
- [ ] S3 在 Vercel 中检查是否有不再使用的历史环境变量，标记待删除。
- [ ] S4 通知团队：`2026-03-05` 之后生成的新密钥为唯一有效版本。

---

## 2. 执行顺序（建议按优先级）

1. Supabase `service_role` + DB Password（最高权限，先换）
2. GitHub/Google OAuth `client_secret`
3. AI/第三方 API keys（Apify/DeepSeek/Google AI/Unsplash）
4. 清理旧 Neon 连接变量与废弃凭据

---

## 3. Supabase 轮换（优先）

### 3.1 轮换 `tabi-ai-prod`

- [ ] P1 在 Supabase `tabi-ai-prod` 项目中生成新 key：
  - `publishable/anon`
  - `service_role`（或新体系下 secret key）
- [ ] P2 重置 `tabi-ai-prod` 数据库密码（Database Settings）。
- [ ] P3 从 `Connect` 页面重新复制连接串：
  - `PROD_DATABASE_URL`（pooler）
  - `PROD_DIRECT_URL`（direct）
- [ ] P4 更新 Vercel 环境变量（Production）：
  - `DATABASE_URL` = `PROD_DATABASE_URL`
  - `DIRECT_URL` = `PROD_DIRECT_URL`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`（或 publishable）
  - `SUPABASE_SERVICE_ROLE_KEY`（仅服务端）
- [ ] P5 触发 Production 新部署（环境变量变更必须重部署）。
- [ ] P6 生产验证：
  - 登录/注册
  - 新建 session
  - handbook 生成
  - 公开页面读取
- [ ] P7 在 Supabase 中作废旧 key/旧密码。

### 3.2 轮换 `tabi-ai-dev`

- [ ] D1 在 Supabase `tabi-ai-dev` 中生成新 key（同上）。
- [ ] D2 重置 `tabi-ai-dev` 数据库密码。
- [ ] D3 从 `Connect` 复制：
  - `DEV_DATABASE_URL`（pooler）
  - `DEV_DIRECT_URL`（direct）
- [ ] D4 更新 Vercel 环境变量：
  - `Preview`、`Development` 两个环境都更新为 dev 值
- [ ] D5 触发一次 Preview/Dev 新部署并验证。
- [ ] D6 作废旧 key/旧密码。

---

## 4. OAuth 密钥轮换

### 4.1 GitHub OAuth

- [ ] G1 GitHub Developer Settings -> OAuth App -> `Generate a new client secret`
- [ ] G2 更新：
  - `AUTH_GITHUB_CLIENT_SECRET`（Vercel + 本地）
- [ ] G3 重部署并验证 GitHub 登录。
- [ ] G4 删除旧 secret。

### 4.2 Google OAuth

- [ ] O1 Google Cloud Console -> Credentials -> OAuth Client -> `Reset secret`
- [ ] O2 更新：
  - `AUTH_GOOGLE_CLIENT_SECRET`（Vercel + 本地）
- [ ] O3 重部署并验证 Google 登录。
- [ ] O4 删除旧 secret。

---

## 5. 第三方 API Key 轮换

- [ ] K1 `APIFY_API_KEY`：生成新 token，更新 env，验证调用后删除旧 token。
- [ ] K2 `DEEPSEEK_API_KEY`：创建新 key，更新 env，验证生成链路后删除旧 key。
- [ ] K3 `GOOGLE_GENERATIVE_AI_API_KEY`：创建新 key，更新 env，验证后删除旧 key。
- [ ] K4 `UNSPLASH_ACCESS_KEY`：创建新 key，更新 env，验证图片检索后删除旧 key。

---

## 6. Vercel 与本地同步动作（每轮通用）

- [ ] V1 在 Vercel 控制台更新目标环境变量（Production/Preview/Development）。
- [ ] V2 本地拉取最新变量：

```bash
vercel env pull .env.development.local
```

- [ ] V3 本地 `.env.local` 只保留开发必需密钥，移除过期值。
- [ ] V4 重部署后检查日志 30-60 分钟，无 401/403/DB auth failed。

---

## 7. Neon 退场清理（完成 Supabase 切换后）

- [ ] N1 移除 Vercel 中所有 `DATABASE_URL_*NEON*` 相关变量。
- [ ] N2 本地清理 `.env.local/.env.production.local` 中旧 Neon 变量。
- [ ] N3 在文档中记录“Neon 废弃日期”（示例：`2026-03-06`）。
- [ ] N4 确认无任何作业/脚本再依赖 Neon 后，再在 Neon 平台停用凭据。

---

## 8. 验收标准（DoD）

- [ ] R1 所有旧密钥已在各平台作废，无法继续访问。
- [ ] R2 Vercel 三个环境都已使用新值并完成重部署。
- [ ] R3 核心业务链路验证通过（认证、会话、handbook 生成、公开访问）。
- [ ] R4 本地与仓库中无明文泄露文件进入 Git 历史。

---

## 9. 执行记录（每次轮换填写）

- 执行人：
- 执行日期：
- 变更环境：`Production / Preview / Development`
- 已轮换项：
- 验证结果：
- 回滚情况（如有）：
- 备注：

---

## 10. 快速提醒

- 只“修改配置值”不算完成 rotation，必须确保旧值被停用。
- `service_role` 仅限服务端，绝不进入前端包、公开仓库或客户端日志。
- 轮换结束后建议再做一次日志审计（最近 24-72 小时）。
