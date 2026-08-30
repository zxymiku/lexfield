# @lexfield/ui

Endfield 家族设计系统 + 应用壳层组件。视觉契约:`data-ark-theme="endfield"` + `data-ark-depth="maximal"`。

## 设计契约

| 轴 | 值 |
|---|---|
| family | `endfield` — 纸白 `#f2f2f0` 舞台 + 炭黑坞站 `#191919` + 信号黄 `#fffa00`;绿 `#00ffa2` 仅用于验证/在线状态 |
| depth | `maximal` — 状态驱动的仪表化、分段编排动效、桌面/竖屏双向重构(reduced-motion 有静态等价) |

- **几何**:0–2px 圆角、1px 规线、45° 切角楔形、角括号、超大幽灵数字
- **文字**:中文主标签 + 英文微标签(大写字距 .14em);display 紧排,数据一律 tabular-nums
- **信号纪律**:黄色只用于主操作/激活态/进度填充;绿色只表验证;不做危险条纹、不加假遥测
- **可达性**:2px 焦点轮廓(暗面用信号黄)、40×40 目标、图标控件带 aria 名、`prefers-reduced-motion` 全覆盖

## 结构

```
src/
├── styles/
│   ├── tokens.css      # 家族变量 + 深度变量(两轴独立)
│   ├── base.css        # reset/排版/焦点/选区/滚动条
│   ├── components.css  # 壳层/面板/按钮/芯片/输入/表格 + @ark-ui 部件样式
│   └── motion.css      # 黄色擦除、裁切显现、呼吸块、步进 ticker
├── icons.tsx           # 原创线性图标(24px, 1.75 描边)
├── primitives.tsx      # @ark-ui/react 封装:Dialog/Toast/Select/Switch/Slider/Tooltip
└── components/         # ArkShell / ArkPage / ArkPanel / ArkSection / ArkButton / ArkChip / ArkTierChip / ArkProgress
```

## 用法(应用侧)

```tsx
import '@lexfield/ui/styles.css'

<ArkShell brand="LEXFIELD" code="LOGISTICS / 04" nav={...} activeId="today" onNavigate={...}
          statusItems={[{ label: 'DUE', value: '12' }]}>
  <ArkPage>
    <ArkSection index="01" total="06" en="TODAY">今日</ArkSection>
    <ArkButton variant="signal">开始学习</ArkButton>
  </ArkPage>
</ArkShell>
```
