# Style Console 改造检查点（临时文档）

> 状态：已完成工程验收，等待你确认功能验收
>
> 约定：本文件用于阶段性交付与验收，**验收通过后删除**。

## 1. 基线与约束

- 设计与字段基线：
  - `docs/version2.0/html-edit.md`
  - `pencil-demo.pen` Node ID: `kwTTo`
- 实施约束：
  - 不自由发挥，按 Block 组织
  - 支持控件：`Select` / `Button Group` / `Input` / `Input + Unit` / `Color Picker`
  - 当前未选中元素时不显示 “No current selection”，直接显示空值样式面板
  - 值回显遵循：无值时 `''`（空字符串）

## 2. 变更范围（本轮）

- 样式字段与枚举扩展：
  - `src/app/session/[id]/_lib/handbook-selection.ts`
- Style Console 组件化重构（按 Block 渲染）：
  - `src/app/session/[id]/_components/handbook-style-console.tsx`
- 容器面板改为挂载新组件：
  - `src/app/session/[id]/_components/handbook-assistant-panel.tsx`

## 3. 分批实施记录

### Batch 1（已完成）

- [x] 拆分出独立 `handbook-style-console.tsx`
- [x] 按 Block 组织：`Layout / Size / Space / Position / Typography / Decoration`
- [x] 实现 `Select / ButtonGroup / Input / Input+Unit / ColorPicker` 五类控件
- [x] 补齐字段：
  - Layout: `flex-wrap`, `align-content`
  - Size: `min/max width/height`
  - Space: `padding-*`, `margin-*` + mode（All/Custom）
  - Position: `right`, `bottom`, `z-index`
- [x] 去除 “No current selection” 层，未选中时展示空值面板

### Batch 2（待做）

- [ ] `box-shadow` 从单输入升级为子字段 Stack（`x/y/blur/spread/color/inset`）
- [ ] 更高保真对齐 `kwTTo` 的图标化 ButtonGroup 与间距细节（图标符号 + 每行高度精调）

### Batch 1.1（本轮细化，已完成）

- [x] 移除 Style Console 内原生 `<select>`，改为自定义下拉（含单位下拉）
- [x] 颜色控件改为自定义 `Color Picker`（预设色块 + 文本输入 + Apply）
- [x] 缩小 `Input + Unit` 右侧单位区域（由宽版缩到紧凑）
- [x] 统一修正关键圆角：面板 `14`、Section `10`、控件 `8`、按钮组激活片段 `6`
- [x] 修复下拉被遮挡：下拉/颜色弹层改为 `portal + fixed` 浮层定位，不受容器裁剪

### Batch 1.2（本轮细化，已完成）

- [x] `Border` 行修正：扩大 `border-width` 输入区，恢复“可输入值 + 可选单位”
- [x] 颜色选择器拆分为独立组件文件：`handbook-color-picker.tsx`
- [x] `Color Picker` 面板按 `pencil-demo.pen` Node `GC02r` 的结构实现（Header / SV Area / Hue / Alpha / Mode / Value Row）

## 4. 验收清单

### 4.1 功能验收

- [x] 选择元素后，字段值来自当前选中元素样式（代码路径验收）
- [x] 未定义样式字段时显示空值（不填默认值，代码路径验收）
- [x] 未选中元素时，不出现 “No current selection” 卡片（代码路径验收）
- [x] `display` 非 flex 时隐藏 flex 相关字段（代码路径验收）
- [x] `position=static/空` 时隐藏 top/right/bottom/left/z-index（代码路径验收）
- [x] `supportsVerticalAlign=false` 时隐藏 `vertical-align`（代码路径验收）
- [x] `padding/margin` 的 `All/Custom` 切换行为正确（代码路径验收）

### 4.2 工程验收

- [x] `eslint` 通过（目标文件）
- [x] `next build` 通过

## 5. 删除条件（必须满足）

满足以下条件后删除本文件：

1. 工程验收全通过；
2. 你确认“本轮验收通过”；
3. 删除该文档，避免仓库残留临时过程文档。

---

## 6. 验收记录（待回填）

- 验收时间：`2026-03-20 21:24:50 +0800`
- 命令：
  - `npm run lint -- 'src/app/session/[id]/_lib/handbook-selection.ts' 'src/app/session/[id]/_components/handbook-style-console.tsx' 'src/app/session/[id]/_components/handbook-assistant-panel.tsx'` -> 通过
  - `npm run build` -> 通过
- 备注：
  - 本轮功能项按代码路径完成验收；
  - 视觉高保真（图标化 ButtonGroup、Shadow Stack）仍在 Batch 2。
