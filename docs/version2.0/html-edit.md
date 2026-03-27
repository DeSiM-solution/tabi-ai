# GrapesJS 侧边栏字段定义（按功能分区）

> 目标：用于「选中 DOM 后」右侧样式面板的字段配置。  
> 输出方式：每个模块按 `Block -> Attributes[]` 定义，字段包含 `name/type/show/enum/placeholder` 等信息。  
> 口径：结合当前项目与 GrapesJS 常用样式能力，优先覆盖 Layout / Size / Space / Position / Typography / Decoration。

---

## 0. 字段结构约定

```ts
type SidebarAttribute = {
  name: string; // UI 名称
  css: string; // CSS 属性名
  subGroup?: string; // Block 内子分组（可选）
  uiOnly?: boolean; // 是否仅用于 UI 状态（不直接写入 CSS）
  type:
    | 'Select'
    | 'ButtonGroup'
    | 'Input'
    | 'InputNumber'
    | 'InputNumberUnit'
    | 'Color'
    | 'Composite'
    | 'Stack';
  show: string; // 显示条件表达式
  enum?: string[]; // Select / ButtonGroup 枚举
  units?: string[]; // InputNumberUnit 支持单位
  placeholder?: string; // 空值提示，仅用于说明合法 CSS 值格式，不作为 value/default
  note?: string;
};
```

显示条件表达式约定：

- `Always`
- `when display in ['flex','inline-flex']`
- `when position != 'static'`
- `when tagName in [...]`
- `when paddingMode === 'Custom'`
- `when marginMode === 'Custom'`

## 0.1 值回显与空值策略（重要）

```ts
[
  '所有 Attribute 不定义 default 值',
  '面板值只来自当前选中元素的样式回显',
  "若该属性在当前元素上无值，则回显空字符串 ''",
  '空值时输入框显示 placeholder，不自动补任何默认值',
  "只有用户主动修改时才写入 CSS；清空时写入 ''（或移除该属性）"
]
```

实现建议：

- 读取：`selection.styles[css] ?? ''`
- 展示：控件 `value` 直接绑定上面的回显值
- 写入：`applySelectionStyle(css, nextValue.trim())`

## 0.2 placeholder 约定（重要）

```ts
[
  'placeholder 只在当前值为空时显示',
  'placeholder 不代表 default / initial / 推荐值',
  "placeholder 绝不能写入 value；真实空态仍然是 ''",
  'placeholder 不能驱动 show 条件；show 只看当前真实样式值',
  "很多字段可以不写 placeholder；未定义时等同于 ''",
  '只在特别有帮助时写一个很短的提示词，例如 width/height 的 auto',
  '不要把 placeholder 写成复杂语法说明，也不要把它画成已填写状态'
]
```

实现建议：

- 输入类控件：`placeholder={attribute.placeholder ?? ''}`
- Select：默认不强制显示 placeholder；若要显示，`value` 仍然必须是 `''`
- ButtonGroup：空态不高亮任何按钮；默认不需要额外 placeholder
- placeholder 文案必须与属性语义匹配，避免写成复杂提示文本

---

## 1. Block: Layout

Attributes:

```ts
[
  {
    name: 'Display',
    css: 'display',
    type: 'Select',
    show: 'Always',
    enum: ['block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'none'],
  },
  {
    name: 'Flex',
    css: 'flex-direction',
    type: 'ButtonGroup',
    show: "when display in ['flex','inline-flex']",
    enum: ['row', 'row-reverse', 'column', 'column-reverse'],
  },
  {
    name: 'Justify',
    css: 'justify-content',
    type: 'ButtonGroup',
    show: "when display in ['flex','inline-flex']",
    enum: ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'],
  },
  {
    name: 'Align',
    css: 'align-items',
    type: 'ButtonGroup',
    show: "when display in ['flex','inline-flex']",
    enum: ['stretch', 'flex-start', 'center', 'flex-end', 'baseline'],
  },
  {
    name: 'Flex Wrap',
    css: 'flex-wrap',
    type: 'Select',
    show: "when display in ['flex','inline-flex']",
    enum: ['nowrap', 'wrap', 'wrap-reverse'],
  },
  {
    name: 'Align Content',
    css: 'align-content',
    type: 'ButtonGroup',
    show: "when display in ['flex','inline-flex'] and flex-wrap in ['wrap','wrap-reverse']",
    enum: ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'stretch'],
  },
  {
    name: 'Gap',
    css: 'gap',
    type: 'InputNumberUnit',
    show: "when display in ['flex','inline-flex']",
    units: ['px', '%', 'em', 'rem', 'vw', 'vh'],
  }
]
```

---

## 2. Block: Size

Attributes:

```ts
[
  {
    name: 'Width',
    css: 'width',
    type: 'InputNumberUnit',
    show: 'Always',
    units: ['px', '%', 'em', 'rem', 'vw', 'vh', 'auto'],
    placeholder: 'auto',
  },
  {
    name: 'Height',
    css: 'height',
    type: 'InputNumberUnit',
    show: 'Always',
    units: ['px', '%', 'em', 'rem', 'vw', 'vh', 'auto'],
    placeholder: 'auto',
  },
  {
    name: 'Min Width',
    css: 'min-width',
    type: 'InputNumberUnit',
    show: 'Always',
    units: ['px', '%', 'em', 'rem', 'vw', 'vh', 'auto'],
    placeholder: 'auto',
  },
  {
    name: 'Min Height',
    css: 'min-height',
    type: 'InputNumberUnit',
    show: 'Always',
    units: ['px', '%', 'em', 'rem', 'vw', 'vh', 'auto'],
    placeholder: 'auto',
  },
  {
    name: 'Max Width',
    css: 'max-width',
    type: 'InputNumberUnit',
    show: 'Always',
    units: ['px', '%', 'em', 'rem', 'vw', 'vh', 'none'],
    placeholder: 'none',
  },
  {
    name: 'Max Height',
    css: 'max-height',
    type: 'InputNumberUnit',
    show: 'Always',
    units: ['px', '%', 'em', 'rem', 'vw', 'vh', 'none'],
    placeholder: 'none',
  }
]
```

---

## 3. Block: Space

Attributes:

```ts
[
  {
    name: 'Padding',
    css: 'padding',
    type: 'InputNumberUnit',
    show: 'Always',
    units: ['px', '%', 'em', 'rem', 'vw', 'vh'],
  },
  {
    name: 'Padding Mode',
    css: 'padding-mode',
    uiOnly: true,
    type: 'ButtonGroup',
    show: 'Always',
    enum: ['All', 'Custom'],
    note: 'All = 仅编辑 padding；Custom = 展开四边输入'
  },
  {
    name: 'Padding Top',
    css: 'padding-top',
    type: 'InputNumberUnit',
    show: "when paddingMode === 'Custom'",
    units: ['px', '%', 'em', 'rem', 'vw', 'vh'],
  },
  {
    name: 'Padding Right',
    css: 'padding-right',
    type: 'InputNumberUnit',
    show: "when paddingMode === 'Custom'",
    units: ['px', '%', 'em', 'rem', 'vw', 'vh'],
  },
  {
    name: 'Padding Bottom',
    css: 'padding-bottom',
    type: 'InputNumberUnit',
    show: "when paddingMode === 'Custom'",
    units: ['px', '%', 'em', 'rem', 'vw', 'vh'],
  },
  {
    name: 'Padding Left',
    css: 'padding-left',
    type: 'InputNumberUnit',
    show: "when paddingMode === 'Custom'",
    units: ['px', '%', 'em', 'rem', 'vw', 'vh'],
  },
  {
    name: 'Margin',
    css: 'margin',
    type: 'InputNumberUnit',
    show: 'Always',
    units: ['px', '%', 'em', 'rem', 'vw', 'vh', 'auto'],
  },
  {
    name: 'Margin Mode',
    css: 'margin-mode',
    uiOnly: true,
    type: 'ButtonGroup',
    show: 'Always',
    enum: ['All', 'Custom'],
    note: 'All = 仅编辑 margin；Custom = 展开四边输入'
  },
  {
    name: 'Margin Top',
    css: 'margin-top',
    type: 'InputNumberUnit',
    show: "when marginMode === 'Custom'",
    units: ['px', '%', 'em', 'rem', 'vw', 'vh', 'auto'],
  },
  {
    name: 'Margin Right',
    css: 'margin-right',
    type: 'InputNumberUnit',
    show: "when marginMode === 'Custom'",
    units: ['px', '%', 'em', 'rem', 'vw', 'vh', 'auto'],
  },
  {
    name: 'Margin Bottom',
    css: 'margin-bottom',
    type: 'InputNumberUnit',
    show: "when marginMode === 'Custom'",
    units: ['px', '%', 'em', 'rem', 'vw', 'vh', 'auto'],
  },
  {
    name: 'Margin Left',
    css: 'margin-left',
    type: 'InputNumberUnit',
    show: "when marginMode === 'Custom'",
    units: ['px', '%', 'em', 'rem', 'vw', 'vh', 'auto'],
  }
]
```

---

## 4. Block: Position

Attributes:

```ts
[
  {
    name: 'Position',
    css: 'position',
    type: 'Select',
    show: 'Always',
    enum: ['static', 'relative', 'absolute', 'sticky', 'fixed'],
  },
  {
    name: 'Top',
    css: 'top',
    type: 'InputNumberUnit',
    show: "when position != 'static'",
    units: ['px', '%', 'em', 'rem', 'vw', 'vh', 'auto'],
    placeholder: 'auto',
  },
  {
    name: 'Right',
    css: 'right',
    type: 'InputNumberUnit',
    show: "when position != 'static'",
    units: ['px', '%', 'em', 'rem', 'vw', 'vh', 'auto'],
    placeholder: 'auto',
  },
  {
    name: 'Bottom',
    css: 'bottom',
    type: 'InputNumberUnit',
    show: "when position != 'static'",
    units: ['px', '%', 'em', 'rem', 'vw', 'vh', 'auto'],
    placeholder: 'auto',
  },
  {
    name: 'Left',
    css: 'left',
    type: 'InputNumberUnit',
    show: "when position != 'static'",
    units: ['px', '%', 'em', 'rem', 'vw', 'vh', 'auto'],
    placeholder: 'auto',
  },
  {
    name: 'Z-Index',
    css: 'z-index',
    type: 'InputNumber',
    show: "when position != 'static'",
  }
]
```

---

## 5. Block: Typography

Attributes:

```ts
[
  {
    name: 'Font',
    css: 'font-family',
    type: 'Select',
    show: 'Always',
    enum: [
      'Arial',
      'Arial Black',
      'Brush Script MT',
      'Comic Sans MS',
      'Courier New',
      'Georgia',
      'Helvetica',
      'Impact',
      'Lucida Sans Unicode',
      'Tahoma',
      'Times New Roman',
      'Trebuchet MS',
      'Verdana'
    ],
    note: '支持外部字体时，enum 可改为动态字体列表'
  },
  {
    name: 'Size',
    css: 'font-size',
    type: 'InputNumberUnit',
    show: 'Always',
    units: ['px', '%', 'em', 'rem'],
  },
  {
    name: 'Weight',
    css: 'font-weight',
    type: 'Select',
    show: 'Always',
    enum: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
  },
  {
    name: 'Style',
    css: 'font-style',
    type: 'ButtonGroup',
    show: 'Always',
    enum: ['normal', 'italic', 'oblique'],
  },
  {
    name: 'Text Color',
    css: 'color',
    type: 'Color',
    show: 'Always',
  },
  {
    name: 'Line Height',
    css: 'line-height',
    type: 'InputNumberUnit',
    show: 'Always',
    units: ['', 'px', '%', 'em', 'rem'],
  },
  {
    name: 'Letter Spacing',
    css: 'letter-spacing',
    type: 'InputNumberUnit',
    show: 'Always',
    units: ['px', 'em', 'rem'],
  },
  {
    name: 'Text Align',
    css: 'text-align',
    type: 'ButtonGroup',
    show: 'Always',
    enum: ['left', 'center', 'right', 'justify'],
  },
  {
    name: 'Vertical Align',
    css: 'vertical-align',
    type: 'ButtonGroup',
    show: "when tagName in ['a','em','img','label','small','span','strong','sub','sup','svg','td','th']",
    enum: ['baseline', 'middle', 'top', 'bottom'],
  }
]
```

---

## 6. Block: Decoration

Attributes:

```ts
[
  {
    name: 'Background',
    css: 'background-color',
    type: 'Color',
    show: 'Always',
  },
  {
    name: 'Radius',
    css: 'border-radius',
    type: 'InputNumberUnit',
    show: 'Always',
    units: ['px', '%'],
  },
  {
    name: 'Border',
    css: 'border',
    type: 'Composite',
    show: 'Always',
    note: '子字段: border-width(InputNumberUnit) + border-style(Select) + border-color(Color)'
  },
  {
    name: 'Shadow',
    css: 'box-shadow',
    type: 'Stack',
    show: 'Always',
    note: '子字段: offset-x, offset-y, blur, spread, color, inset'
  }
]
```

---

## 7. 动态规则汇总（用于渲染引擎）

```ts
[
  "Layout.Flex/Justify/Align/Flex Wrap/Gap -> show when display in ['flex','inline-flex']",
  "Layout.Align Content -> show when display in ['flex','inline-flex'] and flex-wrap in ['wrap','wrap-reverse']",
  "Space.Padding Top/Right/Bottom/Left -> show when paddingMode === 'Custom'",
  "Space.Margin Top/Right/Bottom/Left -> show when marginMode === 'Custom'",
  "Position.Top/Right/Bottom/Left/Z-Index -> show when position != 'static'",
  "Typography.Vertical Align -> show when tagName in ['a','em','img','label','small','span','strong','sub','sup','svg','td','th']"
]
```

---

## 8. 当前项目最小落地映射（用于快速对齐）

当前项目已有字段可与本清单直接映射（`src/app/session/[id]/_lib/handbook-selection.ts`）：

- Layout（已接入）: `display`, `flex-direction`, `justify-content`, `align-items`, `flex-wrap`, `gap`
- Layout（按 Wrap 条件显示）: `align-content`
- Space（主输入）: `margin`, `padding`
- Space（Custom 四边）: `margin-top`, `margin-right`, `margin-bottom`, `margin-left`, `padding-top`, `padding-right`, `padding-bottom`, `padding-left`
- Position/Size: `position`, `top`, `left`, `width`, `height`
- Typography: `font-family`, `font-size`, `font-weight`, `font-style`, `color`, `line-height`, `letter-spacing`, `text-align`, `vertical-align`
- Decoration: `background-color`, `border-radius`, `border`, `box-shadow`

如需完全对齐截图版面，可在下一步补充：
- Size: `min-width`, `min-height`, `max-width`, `max-height`
- Position: `right`, `bottom`, `z-index`
- Flex Child：暂不纳入（按当前复杂度先移除）
