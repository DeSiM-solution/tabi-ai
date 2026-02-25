# UI 统一规范（Tabi）

> 来源基线：`/pencil-demo.pen`  
> 适用范围：`src/app/**` 所有新页面、组件和后续 agent 自动生成 UI

## 1. 设计 Token（唯一真源）

### 1.1 颜色

| Token | 值 | 推荐 Tailwind 类 |
| --- | --- | --- |
| `--bg-primary` | `#FAFAF8` | `bg-bg-primary` |
| `--bg-elevated` | `#FFFFFF` | `bg-bg-elevated` |
| `--bg-secondary` | `#F5F3EF` | `bg-bg-secondary` |
| `--text-primary` | `#2D2A26` | `text-text-primary` |
| `--text-secondary` | `#6B6560` | `text-text-secondary` |
| `--text-tertiary` | `#9C968F` | `text-text-tertiary` |
| `--text-inverse` | `#FAFAF8` | `text-text-inverse` |
| `--accent-primary` | `#0D9488` | `bg-accent-primary` / `text-accent-primary` |
| `--accent-primary-bg` | `#F0FDFA` | `bg-accent-primary-bg` |
| `--accent-secondary` | `#F97066` | `text-accent-secondary` |
| `--status-error` | `#E11D48` | `text-status-error` |
| `--status-success` | `#10B981` | `text-status-success` |
| `--status-success-bg` | `#10B98120` | `bg-status-success-bg` |
| `--status-warning` | `#0D9488` | `text-status-warning` |
| `--status-warning-bg` | `#F0FDFA` | `bg-status-warning-bg` |
| `--status-fail` | `#F97066` | `text-status-fail` |
| `--status-fail-bg` | `#F9706620` | `bg-status-fail-bg` |
| `--border-light` | `#E8E6E3` | `border-border-light` |
| `--border-default` | `#D4D0CB` | `border-border-default` |

### 1.2 字体

- 正文字体：`font-sans`（Inter，含 Noto Sans JP 回退）
- 等宽字体：`font-mono`（JetBrains Mono）
- 展示标题：`font-display`（Playfair Display）
- 装饰手写：`font-script`（Dancing Script）

### 1.3 尺度（来自 `.pen`）

- 字号刻度：`10, 11, 12, 13, 14, 15, 16, 18, 36`
- 圆角刻度：`2, 4, 6, 8, 10, 12, 14`
- 间距刻度：`2, 4, 6, 8, 12, 16, 24, 32`
- 描边厚度：`1`（默认），避免使用 `2+` 的重描边风格

### 1.4 动效

| Token | 值 | 用途 |
| --- | --- | --- |
| `--motion-page-enter-duration` | `420ms` | 页面切换入场时长 |
| `--motion-page-enter-distance` | `20px` | 从上往下入场位移 |
| `--motion-page-enter-ease` | `cubic-bezier(0.22, 1, 0.36, 1)` | 页面入场 easing |

- 页面入场统一使用：`ui-page-enter-down`
- 用户开启「减少动态效果」时，必须禁用入场动画

## 2. 强制规则（给 agent）

1. 新 UI 优先使用语义 token 类（如 `bg-bg-primary`），不要直接写 `zinc-*` 或随机 hex。  
2. 间距、圆角、字号必须优先落在上述刻度上；超出刻度需写注释说明原因。  
3. 页面默认浅色主题，不做系统深色自动切换。  
4. 正文/信息密集区统一用 `font-sans`，代码和 tool 名称统一 `font-mono`。  
5. 组件状态色统一：主操作用 `accent-primary`，弱强调用 `accent-primary-bg`。  
6. 默认边框用 `border-border-light`，需要更强分割才用 `border-border-default`。
7. 错误文案统一使用 `text-status-error`，禁止在业务组件直接写 `text-rose-*`。
8. 破坏性操作（如 Context Menu 的 Delete）使用 `text-accent-secondary`。
9. 页面切换（例如 session -> 首页）统一使用 `ui-page-enter-down`，但只挂在中间主内容容器；左侧 Sidebar 和右侧 Chat 面板不加该动画。
10. Tool 状态 badge 统一使用 `status-success / status-warning / status-fail`，不要再写 `emerald/amber/rose` 类名。

## 3. 组件风格基线

1. 卡片：浅背景 + 细边框 + 中圆角（`rounded-[10px]` 或 `rounded-[12px]`）。  
2. 输入框：`bg-bg-secondary` + `border-border-light`，聚焦时使用 `accent-primary`。  
3. 侧边栏：`bg-bg-elevated`，列表 hover 使用浅层背景变化，不用重阴影。  
4. 主按钮：`bg-accent-primary text-text-inverse`，禁用态降低对比度。  
5. 次级信息（时间、描述、meta）统一 `text-text-tertiary`。
6. 错误状态文案（如 Sidebar 的 `Error`）统一 `text-status-error`。
7. 页面中间主内容容器添加 `ui-page-enter-down` 入场动画。

### 3.1 Chat Panel（右侧）规格

1. Header：`padding: 20 20 16 20`，标题 `15/600`，副标题 `12~13/500`。
2. Messages 区：`padding: 16`，消息块间距 `16`。
3. 用户消息：`bg-accent-primary`，`rounded-[12px]`，`padding: 16`，正文 `13`。
4. Tool Card：`bg-bg-secondary + border-border-light + rounded-[10px] + padding 12`，tool 名用 `font-mono` 11~12。
5. 输入区：顶部 `1px border-border-light`，输入框高度 `44`、圆角 `12`、背景 `bg-bg-secondary`；发送按钮 `44x44`、`rounded-[12px]`、`bg-accent-primary`。

## 4. 扩展流程

1. 先改 `src/app/globals.css` 里的 token。  
2. 同步更新本文件表格和规则。  
3. 再在业务页面使用新的语义类。  

不要只改业务页面颜色而不补 token，这会让后续 agent 继续发散。
