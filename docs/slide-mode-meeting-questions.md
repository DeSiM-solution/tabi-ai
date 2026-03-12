## 已确定方向
1. 目标优先级：编辑效率、用户更友好。
2. 去掉 Block，编辑区以 Plasmic 为主。
3. 必须保证 LLM 能正确解析地图 CSV。
4. MVP：用 Plasmic 替换 Block 进行 handbook 页面编辑。
5. Plasmic 不开新页面，直接嵌入现有编辑区域。
6. 不再切换 Handbook / Block，只保留 “编辑（Plasmic）/预览（HTML）”。
7. 2.0 第一版不引入 slides；第二版再引入 slides 及相关功能。
8. Save/Remix 生成新的 `Handbook.html` 版本，且仅保留一个功能按钮（语义合并）。
9. Remix 默认行为：Auto Remix（写新稿，匹配用户选择的 aesthetic）。
10. 每次 Remix 都生成新 HTML 版本；是否保留/公开由用户决定，支持删除。
11. 初始 LLM 生成 Plasmic 草稿与 HTML（首版不开放编辑）。
12. 用户编辑通过 Remix 修改 Plasmic，生成后续 HTML 版本。

## Plasmic 方案核心
1. Plasmic 草稿是否只保留最新一份（无历史）？

## 渲染与版本
1. 生成 HTML 的方式：Render API 或 SSR。
Render API：集成快、无需自建渲染，但不支持 Code Components（你自写的 React 组件），依赖外部服务稳定性。
SSR：支持 Code Components、可控性强，但实现复杂、每次请求需要服务端渲染（CPU/内存占用、延迟、缓存与扩容成本）。
2. 已确定：每个生成的 handbook 初始为 DRAFT，用户改为 PUBLIC 才公开。

## 数据与导出
1. CSV 导出保留。
2. 数据来源（结构化/AI 解析）为后续待定，可能本次会议不结论。

## 第二版（Slide 方向）待定问题
1. 是否固定 “一页 = 一个 Slide 组件”？
2. 初次生成是否由 LLM 自动拆分 slides？还是用户手动分？
3. 需要哪些模板类型（如 `title/section/list/image`）？
4. 是否允许拖拽重排、复制、删除？
5. 若引入 slide 动画/播放器等自定义逻辑，是否需要迁移到 SSR 以支持 Code Components？

## 迁移与兼容
1. 旧的 Block/HTML 是否保留只读兼容？
