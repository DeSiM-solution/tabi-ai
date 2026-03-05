# 图片覆盖率提升改造计划（`search_image` / `generate_image`）

> 目标：不要求 100% 覆盖，但默认流程下图片覆盖率需达到 **>= 75%**。  
> 说明：本文先作为执行计划，不包含代码改动。后续按 checklist 分步实施并打标。

## 0. 目标与定义（执行前对齐）

- 覆盖率定义（本次建议）：
  - `target_coverage_ratio = matched_image_count / target_block_count`
  - `full_coverage_ratio = matched_image_count / full_block_count`
  - `matched_image_count`：最终可用于 HTML 的图片数量（`unsplash + generated`）
- 达标条件：
  - 以 `full_coverage_ratio >= 0.75` 作为主验收标准
  - 等价：`matched_image_count >= ceil(full_block_count * 0.75)`
- 非目标：
  - 不追求所有 block 都有图
  - 不在第一版解决“图片审美质量评分”问题（先保覆盖率）

## 1. 当前现状回顾（代码事实）

- 当前上限：`HANDBOOK_IMAGE_MAX_TARGETS`（默认 16，按 block 数动态截断）
- 当前问题点：
  - 低置信度场景下还未启用 LLM 评图（当前仍是规则优先）

## 1.1 重要约束澄清（先统一认知）

- `per_page` 增大（如 3/5/10）不会直接增加 LLM token 成本：
  - 它主要增加的是 Unsplash API 返回量、网络时延、限流风险。
- 只有把候选图片交给 LLM 评审时才会增加 token。
- 本次目标优先级：
  - 先保证覆盖率 >= 75%
  - 再优化“图片是否最适合”的审美质量

## 2. 候选方案对比（先选策略，再编码）

### 方案 A：二轮 Unsplash 补检索（不生成图）

- 做法：第一轮结束后，如果 `<75%`，对未命中 block 再检索一次（放宽 query）。
- 优点：都是真实图源，风格更一致。
- 缺点：仍可能不达标；受 API 限速与结果质量影响明显。

### 方案 B：覆盖率守门 + 混合补齐（推荐）

- 做法：
  - 第一轮：正常 `search_image`
  - 检索参数建议：`per_page=3~5`（不是 10）
  - 候选筛选建议：先走规则重排（不走 LLM）
  - 若 `<75%`：第二轮先补 Unsplash（小范围重试），仍不足则自动调用 `generate_image` 补齐到 `ceil(target*0.75)`
- 优点：达标可控，失败面更小。
- 缺点：会混入生成图，需要在 UI/日志里标注来源；规则重排初期可能不如人工审美。

### 方案 C：直接交给 LLM 决策（search vs generate）

- 做法：让模型直接判断每个 block 用 `search_image` 还是 `generate_image`。
- 优点：灵活。
- 缺点：可解释性差、波动大，调试困难。

### 方案 AB（A+B 组合，推荐主方案）

- 做法：
  - 第一轮：Unsplash 正常搜索（`per_page=3` 起步）+ 规则重排
  - 第二轮：只对未命中 block 做 Unsplash 补检索（更宽松 query）
  - 覆盖率守门：若两轮后仍 `<75%`，再调用 `generate_image` 按差额补齐
- 优点：
  - 真实图优先（先搜两轮）
  - 覆盖率有硬保障（不足再补生成）
  - 兼顾质量与稳定性
- 缺点：
  - 流程更长，时延略增
  - 仍受 Unsplash 限流影响

**建议采用：方案 AB（先二轮真实图，再覆盖率补齐）。**

## 2.1 推荐落地策略（两阶段）

### 阶段 1：低成本稳定版（本次实施）

- `per_page` 从 1 提升到 3~5（建议先 3）
- 规则重排，不触发 LLM 评图：
  - query 与图片元数据文本匹配度
  - 横图优先（已设 `orientation=landscape`）
  - 分辨率阈值（过小图片降级）
  - 来源字段完整度（`source_page/credit`）
- 未命中 block 进入第二轮 Unsplash 补检索
- 两轮后若仍不足 75%，按差额补生成图

### 阶段 2：质量增强版（后续可选）

- 仅在“低置信度”时触发多模态模型裁决：
  - 规则 top-1 与 top-2 分差小于阈值时，才让模型二选一
  - 每个 block 最多触发 1 次模型评图
- 推荐模型：复用当前栈的轻量多模态（如 `gemini-2.5-flash`）
- 成本护栏：
  - 每次 session 最多触发 N 次（建议 N=2）
  - 超过预算则回退到规则结果

## 3. 分步执行清单（按阶段推进）

### Phase 0：文档对齐（当前阶段）

- [x] P0-1 明确业务目标：覆盖率至少 75%（2026-03-05）
- [x] P0-2 产出改造计划文档（本文件，2026-03-05）
- [x] P0-3 评审并确认“覆盖率定义 + 推荐方案 AB（A+B 组合）”（2026-03-05）

### Phase 1：覆盖率契约与预算策略

- [x] P1-1 新增配置项（建议）（2026-03-05）：
  - `HANDBOOK_IMAGE_MIN_COVERAGE=0.75`
  - `HANDBOOK_IMAGE_MAX_TARGETS`（默认 16；实际目标数按 block 数动态截断）
- [x] P1-1b 新增检索配置项（建议）（2026-03-05）：
  - `HANDBOOK_UNSPLASH_PER_PAGE=3`（可调 3~5）
  - `HANDBOOK_ENABLE_LLM_IMAGE_RERANK=false`（默认关闭）
  - `HANDBOOK_IMAGE_RERANK_MAX_CALLS_PER_SESSION=2`
- [x] P1-2 定义 `target_block_count` 计算规则（2026-03-05）：
  - 先按优先级选 block，再截断到 `maxTargets`
- [x] P1-3 在 tool 输出中增加覆盖率字段（2026-03-05）：
  - `target_block_count`
  - `required_image_count`
  - `coverage_ratio`

### Phase 2：第一轮搜索改造（先提高命中率）

- [x] P2-1 planner 约束强化（2026-03-05）：
  - 增加 `requiredImageCount` 约束，要求计划最少覆盖达标所需数量
  - 提示词强调优先覆盖更多 distinct block，避免只挑前几条
- [x] P2-2 Unsplash 查询策略优化（小步）（2026-03-05）：
  - `per_page` 从 1 提升到配置化默认 3（已完成）
  - 保持每个 query 最大 2 次重试上限，避免放大限流风险（已完成）
- [x] P2-3 增加规则重排（不使用 LLM）（2026-03-05）：
  - 从同一 query 的多个候选里按规则分（文本匹配/比例/分辨率/元数据）选择 best hit
- [x] P2-4 记录每个 block 的尝试结果（2026-03-05）：
  - `search_image` 输出新增 block 级 `status/reason/selected_score/attempts`

### Phase 3：二轮 Unsplash + 覆盖率守门补齐

- [x] P3-1 第一轮结束后计算 `coverage_ratio`（2026-03-05）
- [x] P3-2 对未命中 block 执行第二轮 Unsplash 补检索（真实图优先）（2026-03-05）
- [x] P3-3 第二轮后计算覆盖率；若仍 `<75%`，调用 `generate_image` 补齐差额（2026-03-05）：
  - `gap = required_image_count - matched_image_count`
  - 仅对 unresolved block 生成
- [ ] P3-4（可选）低置信度触发 LLM 评图：
  - 仅在 top-1/top-2 规则分差过小时触发
  - 受 `HANDBOOK_ENABLE_LLM_IMAGE_RERANK` 与调用预算限制

### Phase 4：输出与持久化统一

- [ ] P4-1 统一输出结构（search + generate 合并）：
  - 保留 `source`（`unsplash` / `imagen`）
  - 明确 `final_image_count` 和 `coverage_ratio`
- [ ] P4-2 持久化字段对齐到 `SessionState.context.handbookImages` 与 `toolOutputs`
- [ ] P4-3 前端读取逻辑验证：
  - Blocks 编辑区可看到回填图片（URL 图优先）

### Phase 5：验收与灰度

- [ ] P5-1 构造 3 组样本（6 / 10 / 15 blocks）做回归
- [ ] P5-2 验证达标：
  - 目标：>=80% 的 session 达到 `coverage_ratio >= 0.75`
- [ ] P5-3 若不达标，按日志定位是：
  - 选块不足 / 查询命中不足 / 生成补齐不足

## 4. 关键实现点（后续编码参考）

- 后端：
  - `src/agent/tools/types.ts`
  - `src/agent/tools/shared.ts`
  - `src/agent/tools/search-image.ts`
  - `src/agent/tools/generate-image.ts`
  - `src/agent/tools/generate-handbook-html.ts`
- 提示词：
  - `src/agent/prompts/image-query-planning.ts`
- 前端（仅校验，不先改视觉）：
  - `src/app/session/[id]/page.tsx`

## 5. 风险与边界

- Unsplash 限速/403/429 可能导致二轮仍失败，需要生成图兜底。
- 如果目标 block 太多，需通过 `maxTargets` 控制成本和时延。
- 生成图为 `data:` URL 时会增加 payload 压力，建议中期改为对象存储 URL。
- 若直接 `per_page=10`，虽然 token 不一定增加，但请求量/时延/限流风险显著上升，不建议第一版采用。

## 6. 评审问题（请先确认）

1. `target_block_count` 你希望默认上限是 8 还是 10？  
2. 二轮 Unsplash 的预算你希望是：
   - 每个 unresolved block 最多 1 次补检索（保守）
   - 每个 unresolved block 最多 2 次补检索（更激进）？
3. 验收口径是否接受：
   - 单次 session 达到 75% 即通过，
   - 长期看整体 session 达标率 >=80%？
