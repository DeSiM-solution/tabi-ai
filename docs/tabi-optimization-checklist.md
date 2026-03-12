# Tabi 优化点 Checklist

> 用法：完成一项就把 `- [ ]` 改成 `- [x]`。  
> 备注：每项下面的 DoD（Definition of Done）是验收标准建议。

---

## 1.1

- [x] **1.1-1 图片 URL：支持上传/切换 + 后端存储**
  - DoD：
    - 编辑 Block 时可上传图片 / 选择替换图片（不再只依赖外链 URL）
    - 图片有稳定的后端可访问地址（带权限/有效期策略或 public CDN）
    - 生成 HTML 使用存储后的图片 URL；保存 blocks/HTML 后刷新仍可用
  - Notes：需确定存储方案？单独找一个存储的服务器（如对象存储 / Supabase Storage、Google Cloud Storage 等）+ 限制（大小/格式/配额）

- [x] **1.1-2 Block 区域支持上下拖动排序（Blocks 编辑器内）**
  - DoD：
    - 在 Blocks 编辑区可以拖拽重排（替代/补充现在的上下箭头）
    - 保存后顺序写入 session state（`/api/sessions/{id}/state`）
    - Regenerate HTML 时继承该顺序

- [x] **1.1-3 导出 Google Maps CSV：增加引导**
  - DoD：
    - 点击导出后，除了下载 CSV，还能看到“如何导入到 Google My Maps/Maps”的步骤引导（弹窗/侧栏）
    - 对常见失败情况有提示（无坐标、列名不匹配、编码问题等）
  - Notes：当前已具备 CSV 生成与下载能力，主要补“引导与错误提示”

- [ ] **1.1-4 每个步骤用时统计（s）**
  - DoD：
    - 会话页面能看到每个 tool step 的耗时（例如 12.3s）
    - 失败/取消时也能记录耗时（尽量可观测）
  - Notes：后端已有 `SessionStep.durationMs` 字段，重点在“确保写入 + 前端展示”

- [x] **1.1-5 Block完成拖动排序**
  - DoD：
    - 除了上下箭头，Block 区域支持拖动排序（替代/补充现在的上下箭头）
    - 保存后顺序写入 session state（`/api/sessions/{id}/state`）
    - Regenerate HTML 时继承该顺序

- [x] **1.1-7 解决 iframe 里面 YouTube 链接无法跳转的问题**
  - DoD：
    - 预览 HTML 中任何指向 YouTube 的链接都能正常打开（推荐新标签）
    - 不会在 iframe 内加载 watch 页导致 “Refused to connect / X-Frame-Options” 类问题
  - Notes：与 1.1-5 可能是同一类问题，可合并实现但 checklist 保留两项

- [x] **1.1-8 埋点：统计 gojapan 跳转次数**
  - DoD：
    - gojapan 相关入口点击有埋点（事件名、会话 id、handbook id、来源位置等）
    - 可以在 DB/日志/分析平台里统计“跳转次数/转化漏斗”
  - Notes：需要先确认埋点落地方式（自建事件表 / 第三方分析）


---

## 2.0（中期优化）

- [ ] **2.0-1 使用拖拽 HTML 的方式（Inline HTML 编辑态）**
  - DoD（v1 形态建议）：
    - 在预览 HTML 里直接拖拽重排 blocks（section）
    - 可直接编辑标题/描述（纯文本），并一键保存
    - 保存同时落到：`Handbook.html`（即时生效）+ blocks（后续 AI 再生继承）
  - Notes：需要让生成的 HTML 带稳定锚点（如 `data-block-id`），集成 plasmic 拖拽 https://github.com/plasmicapp/plasmic

- [ ] **2.0-2 增加可替换的 tools（不再固定流程）**
  - DoD：
    - 后端 orchestration 支持按“配置/模式”选择 tools 组合，而不是写死 full_pipeline
    - 前端可选择/切换模式（例如：只再生 HTML / 重新找图 / 跳过坐标等）
    - 有清晰的降级与兼容策略（旧 session 不受影响）
  - Notes：建议先做“可配置的工具白名单 + stopWhen 策略”最小闭环

---
