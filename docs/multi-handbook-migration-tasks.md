# 多 Handbook（基于 handbookId）改造任务清单

> 目的：把当前「一个 Session 只对应一个 Handbook」改造成「一个 Session 对应多个 Handbook」。
>
> 本文是执行清单。每完成一个 task，直接勾选 `[x]` 并补充日期/PR。

## 1. 目标模型（执行基线）

- `Session` 下面有多个 `Handbook`
- `Session` 只维护当前选中 `activeHandbookId`
- `Handbook` 的唯一身份由 `handbookId` 表达，前后端所有读写都以 `handbookId` 为准
- `publish/archive/draft` 为 `Handbook` 级，不再是 `Session` 级
- 预览与公开访问以 `handbookId` 为主键
- `SessionState` 保留为运行态/编辑态快照（`context/blocks/toolOutputs`），不再充当唯一 HTML 容器

## 2. 执行规则

- 每个 task 独立可验证，可单独提交 PR
- 禁止跨阶段大改；优先做兼容，再做替换，再做清理
- 对外 API 先兼容旧路径，再逐步迁移调用方
- 完成 task 后勾选并追加简短备注

示例：

```md
- [x] T2-3 新增 handbook 列表接口（2026-03-03, PR #123）
```

## 3. 分阶段任务清单

### Phase 0: 对齐与冻结范围

- [x] T0-1 确认术语映射：产品文案统一为 `Handbook`（已在本文落地）
- [x] T0-2 确认标识策略：不使用版本序号作为主标识，统一使用 `handbookId`（已在本文落地）
- [x] T0-3 锁定 UI 行为：切换 handbook、发布 handbook、分享当前 public handbook（已在本文规则落地）
- [x] T0-4 在 `docs/chat-flow.md`、`docs/process-management.md` 标注“即将迁移”章节（2026-03-03）

### Phase 1: 数据库改造（Prisma + Migration）

- [x] T1-1 新增 `Handbook` model（`id/sessionId/title/html/lifecycle/generatedAt/publishedAt/archivedAt/...`）（`prisma/schema.prisma`）
- [x] T1-2 给 `Session` 增加 `activeHandbookId`（可空）（`prisma/schema.prisma`）
- [x] T1-3 建索引：`sessionId+updatedAt`、`sessionId+lifecycle`、`lifecycle+publishedAt`（`prisma/schema.prisma` + SQL）
- [x] T1-4 保留 `SessionState` 现有字段以兼容旧逻辑（本阶段不删除旧字段，2026-03-03）
- [x] T1-5 编写 migration SQL 与 Prisma schema 同步（`prisma/migrations/20260303_multi_handbook_phase1.sql`）
- [x] T1-6 准备数据回填脚本：从 `SessionState.handbookHtml` 回填初始 `Handbook`（`scripts/backfill-session-handbooks.mjs`）
- [x] T1-7 回填后设置 `Session.activeHandbookId`（已在回填脚本实现）

### Phase 2: 服务层改造（`src/server/sessions.ts`）

- [x] T2-1 新增 handbook 读写 DTO：summary/detail/preview/public（`src/server/sessions.ts`）
- [x] T2-2 新增服务方法：`listSessionHandbooks(sessionId,userId)`（`src/server/sessions.ts`）
- [x] T2-3 新增服务方法：`createSessionHandbook(sessionId,userId,payload)`（`src/server/sessions.ts`）
- [x] T2-4 新增服务方法：`updateSessionHandbook(handbookId,userId,patch)`（`src/server/sessions.ts`）
- [x] T2-5 新增服务方法：`setHandbookLifecycle(handbookId,userId,lifecycle)`（`src/server/sessions.ts`）
- [x] T2-6 新增服务方法：`setActiveHandbook(sessionId,userId,handbookId)`（`src/server/sessions.ts`）
- [x] T2-7 新增服务方法：`removeSessionHandbook(handbookId,userId)`（`src/server/sessions.ts`）
- [x] T2-8 保留旧的 session 级 handbook API 行为，内部代理到 `activeHandbook`（`src/server/sessions.ts`）

### Phase 3: API 路由改造（兼容优先）

- [x] T3-1 新增 `GET /api/sessions/[id]/handbooks`（`src/app/api/sessions/[id]/handbooks/route.ts`）
- [x] T3-2 新增 `POST /api/sessions/[id]/handbooks`（`src/app/api/sessions/[id]/handbooks/route.ts`）
- [x] T3-3 新增 `PATCH /api/sessions/[id]/handbooks/[handbookId]`（`src/app/api/sessions/[id]/handbooks/[handbookId]/route.ts`）
- [x] T3-4 新增 `DELETE /api/sessions/[id]/handbooks/[handbookId]`（`src/app/api/sessions/[id]/handbooks/[handbookId]/route.ts`）
- [x] T3-5 新增 `POST /api/sessions/[id]/handbooks/[handbookId]/activate`（`.../activate/route.ts`）
- [x] T3-6 新增 `PATCH /api/sessions/[id]/handbooks/[handbookId]/lifecycle`（`.../lifecycle/route.ts`）
- [x] T3-7 新增 `GET /api/guide/[handbookId]`（复用现有路由，服务层已支持 handbookId）
- [x] T3-8 新增 `GET /api/public/guide/[handbookId]`（复用现有路由，服务层已支持 handbookId）
- [x] T3-9 兼容旧路径 `/api/guide/[sessionId]`：返回当前 `activeHandbook`（服务层已兼容）

### Phase 4: Agent 持久化链路改造

- [x] T4-1 改造 `generate_handbook_html`：输出增加 `handbook_id`、`preview_url`（`src/agent/tools/generate-handbook-html.ts`）
- [x] T4-2 生成 HTML 后写入 `Handbook`（创建新记录），不再只写 `SessionState.handbookHtml`（`src/agent/tools/generate-handbook-html.ts`）
- [x] T4-3 `persistSessionSnapshot` 保持只写运行态快照（`context/blocks/toolOutputs`，2026-03-03）
- [x] T4-4 保持 `requestHasGeneratedHandbook` 语义不变（本次请求至少产出一个 handbook）
- [x] T4-5 回归手动再生成功路径（已存在图片/无图片两种；2026-03-03 18:38，`.env.local` 库执行 migration+backfill 后 smoke 通过：第 1 次 `search_image -> generate_handbook_html`，第 2 次仅 `generate_handbook_html`，`HB1_COUNT=1`、`HB2_COUNT=2`）

### Phase 5: 前端状态层改造（Store）

- [x] T5-1 `sessions-store` 增加 handbook 聚合信息（count/publicCount/activeHandbookId，2026-03-03）
- [x] T5-2 新建或扩展 `handbooks-store`（按 sessionId 缓存 handbook 列表，2026-03-03）
- [x] T5-3 `session-editor-store` 增加 `activeHandbookId` 与 handbook 级预览状态（2026-03-03）
- [x] T5-4 hydration 流程改造：先拉 session，再拉 handbooks，再恢复 active handbook（2026-03-03）

### Phase 6: 前端 UI 改造（按 `pencil-demo.pen`）

- [x] T6-1 详情页顶部接入 handbook 切换器（以 `handbookId` 选择当前项，2026-03-03）
- [x] T6-2 接入 `Public` 按钮与禁用态（无 HTML 时不可发布，2026-03-03）
- [x] T6-3 接入 `external-link` 动作（当前约定：复制 public 链接，2026-03-03）
- [x] T6-4 接入 handbook context menu：rename/set public/move draft/archive/delete（2026-03-03）
- [x] T6-5 左侧 Session 列表展示 handbook 聚合信息（示例：`4 handbooks · 2 public`，2026-03-03）
- [x] T6-6 HTML 预览地址改为 handbook 维度（`/api/guide/{handbookId}`，2026-03-03）
- [x] T6-7 删除/切换 handbook 时处理空态与回退策略（自动切换到下一个可用项，2026-03-03）

### Phase 7: 兼容清理与文档更新

- [x] T7-1 清理 session 级 lifecycle 的旧调用路径（2026-03-03，前端首页/详情页统一改为 handbook 级 lifecycle API，移除 `/api/sessions/{id}/handbook-lifecycle` 的调用）
- [x] T7-2 清理 `SessionState` 中不再使用的 session 级 handbook lifecycle 字段（2026-03-04，移除 `handbookLifecycle/handbookPublishedAt/handbookArchivedAt`）
- [x] T7-3 更新 `docs/chat-flow.md` 为多-handbook 新流程（2026-03-03）
- [x] T7-4 更新 `docs/process-management.md` 的数据模型与接口章节（2026-03-03）
- [x] T7-5 增补运维说明：回填脚本、回滚策略、观测指标（2026-03-03，写入 `docs/process-management.md` 第 8 章）

## 4. 验收标准（DoD）

- [ ] D1 一个 session 可创建、查看、切换多个 handbook（切换键为 `handbookId`）
- [ ] D2 handbook 生命周期独立（draft/public/archived），互不影响
- [ ] D3 仅 public handbook 可分享；分享链接按 handbookId 访问
- [ ] D4 旧 session 数据可自动迁移且可正常打开
- [ ] D5 旧 API 在兼容窗口内可用，新 API 已全面接管前端调用
- [ ] D6 关键路径回归通过：创建 -> 生成 -> 切换 -> 发布 -> 分享 -> 删除

## 5. 风险与回滚预案

- [ ] R1 回填脚本先在测试库演练，再在生产执行
- [ ] R2 上线先保留双读/双写窗口，确认稳定后再删旧字段
- [ ] R3 任何 migration 异常可回滚到“session 级 handbook”读路径

## 6. 任务记录区

- 负责人：
- 开始日期：
- 目标完成日期：
- 关联 PR：
- 备注：
