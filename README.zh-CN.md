# usage-band

[English](README.md) | 中文

一个 Claude Code **mod**：在输入框上方用一排彩色胶囊，实时显示限额、token、速度、费用和上下文占用。点 📈 还能看窗口统计：5h、7d 窗口按 API 价格值多少钱、用量进度，以及每个模型还剩多少 token。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/band-dark.png">
  <img alt="usage-band 横条：5h、7d 限额，in/out/cache token，实时速度，费用，上下文" src="docs/band-light.png">
</picture>

## 显示内容

| 胶囊 | 含义 |
|---|---|
| **5h** | 5 小时限额已用百分比。进度条上的**竖线**表示这个窗口的时间已经过了多少，进度条超过竖线说明用得比时间快；右边是距离重置的时间 |
| **7d** | 7 天限额，规则同上 |
| **in** | 本会话发给模型的输入 token（含首次写入缓存的部分） |
| **out** | 本会话模型生成的输出 token |
| **⚡** | 输出速度（token/秒）。回复过程中**实时刷新**，显示为 `~118 t/s`（估算值）；回复结束后换成按真实 token 数计算的准确值 |
| **cache** | 从缓存读取的 token。每次请求都会带上完整对话，重复的部分走缓存，所以这个数最大，但单价约为普通输入的十分之一 |
| **$** | 本会话累计费用，和 `/cost` 一致 |
| **ctx** | 上下文占用。设置了 `autoCompactWindow`（自动压缩窗口）时按它计算，否则按模型的上下文上限计算 |
| **📈** | 打开或关闭胶囊上方的[窗口统计](#窗口统计)。只有 5h / 7d 限额时才显示 |

进度条颜色：限额用到 90% 以上变红，用量比时间进度快 15% 以上变黄；上下文 60% 以上变黄，80% 以上变红。

### 自适应宽度

始终保持一行。窗口变窄时按顺序压缩：缩短进度条 → 去掉时钟图标、时间改为紧凑写法 → 缩小字号 → 去掉进度条。窗口变宽时自动恢复。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/band-narrow-dark.png">
  <img alt="窄窗口下的紧凑布局" src="docs/band-narrow-light.png" width="600">
</picture>

### 窗口统计

点胶囊行末尾的 **📈**（或运行 `/usage-band stats`），会在胶囊上方打开两张卡片，每个限额窗口一张，回答两个问题：这个窗口值多少钱、可以花多快。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/stats-chart-dark.png">
  <img alt="窗口统计（图表视图）：5h 和 7d 窗口按 API 价格的价值、进度预测、花费速度和曲线图" src="docs/stats-chart-light.png">
</picture>

- **≈ $177 at API prices**：整个窗口按 API 价格折算值多少钱。算法：窗口内已花的钱（按 API 标价，和 `/cost` 同一口径）÷ 已用的限额比例。
- **On pace to finish at 67%** 或 **Limit hit in 5d 0h**：按目前的平均速度，窗口结束时会用到多少，或者多久后撞上限额。
- **Average so far** 和 **Spend up to** / **Slow down to**：目前的平均花费速度，以及刚好在重置时用满限额的速度；5h 按小时、7d 按天计。**≈ 196M Opus** 是把这个速度换算成你最常用的模型的 token 数（按你平时输入、输出、缓存的比例）。
- **曲线图**：实线是窗口内的用量，虚线是按当前速度预测到重置时，浅色线是用满限额的预算线，灰线是上一个窗口在相同时间点的用量（"Last week: 7% by now, 47% at reset"）。

**By model** 视图显示：如果剩下的额度全部用在某一个模型上，还能用多少 token。剩下的钱是同一笔，按各模型价格和你的 token 比例换算。**used** 列是这个窗口里各模型已用的 token。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/stats-model-dark.png">
  <img alt="窗口统计（按模型视图）：Fable 5.1、Opus 5.5、Sonnet 5.5、Haiku 4.5 在每个窗口里剩余的 token" src="docs/stats-model-light.png">
</picture>

**◐** 在"跟随系统 / 浅色 / 深色"之间切换配色（卡片和胶囊是以图片绘制的，"跟随系统"跟的是操作系统，不是 App 的主题）。空间够时两张卡片并排，不够时上下排列。终端里显示为两行文字。

数字怎么来的：

- mod 会把每次请求（模型、token、费用）记到自己存储里的一个小账本，每个会话一份，所以**这台机器上所有 Claude Code 会话都会计入它们共享的窗口**。超过 8 天的记录会被清掉。
- **从安装那一刻开始记账。** 安装前就开始的窗口会显示 `tracked 2h 10m`，从安装后的第一次读数开始估算；下一个窗口就是完整的。
- **在这台机器的 Claude Code 之外的用量**（claude.ai 网页、App、其他电脑）会推高百分比但不进账本，所以会让估出来的金额偏低。
- 上一个窗口的对比线要等 mod 完整观察过一个窗口后才出现。
- 模型价格（每百万 token，输入 / 输出 / 缓存读取）：Fable 5.1 $10 / $50 / $0.25，Opus 5.5 $4 / $20 / $0.20，Sonnet 5.5 $2 / $10 / $0.20，Haiku 4.5 $1 / $5 / $0.10；缓存写入按输入价的 1.25 倍。写在 `hooks/prices.ts` 里。

### 状态栏模式

不想要输入框上方的横条，可以切到输入框下方的状态栏，显示一行纯文字：

```
5h ▰▱▱▱▱ 22% ↻3h13m  ·  7d ▰▰▰▱▱ 56% ↻4d7h  ·  in 70.0k  out 45.1k  ⚡~118 t/s  cache 6.94M  ·  $4.80  ·  ctx ▰▰▱▱▱ 41%
```

## 安装

需要 **Claude Code v2.1.287 或更高版本**，可以在终端里的 `claude` 或桌面 App 的 Code 标签页中使用。mod 默认开启，用 `claude --version` 查看版本。

在终端运行：

```bash
claude plugin marketplace add iluolSNS/claude-code-usage-band
```

```bash
claude plugin install usage-band@cyan-mods
```

也可以在 Claude Code 会话里输入 `/plugin install usage-band@cyan-mods`。安装后开一个新会话即可看到；已经打开的会话运行 `/reload-plugins`。

### 更新

```bash
claude plugin marketplace update cyan-mods
```

```bash
claude plugin update usage-band@cyan-mods
```

### 卸载

```bash
claude plugin uninstall usage-band@cyan-mods
```

## 使用

| 命令 | 作用 |
|---|---|
| `/usage-band` | 在胶囊横条和状态栏之间切换 |
| `/usage-band band` | 切到输入框上方的胶囊横条 |
| `/usage-band status` | 切到输入框下方的状态栏 |
| `/usage-band stats` | 打开或关闭胶囊上方的窗口统计（同 📈） |

你的选择（显示模式、统计是否展开、视图、配色）会被记住，之后的会话也沿用。Claude 正在回复时也可以切换。

## 说明

- **不消耗 token，也不花钱。** 这个 mod 不调用模型，不发网络请求，只读取 Claude Code 已经统计好的数字，然后在本地绘制。
- **数据来源：** 限额、费用、上下文来自 Claude Code 自身的统计，和状态栏、`/cost`、`/context` 一致。in/out/cache 由 mod 在每次请求结束后累加，包括子代理；⚡ 速度只统计主对话。
- **token 计数**从 mod 加载那一刻开始，恢复旧会话（resume）后会从 0 开始；费用和限额不受影响。
- **5h / 7d 限额**只在用 Claude 订阅登录时才有，用 API key 计费时不显示这两项。
- **实时速度是估算值**：输出过程中拿不到真实的 token 数，所以按"已输出字数 ÷ 每个 token 的字数"来估。这个比例会用每次回复的真实数据自动校准，用几次后会越来越准。
- 外面那层灰色底框是桌面 App 自带的，mod 无法去掉。
- 只在终端和桌面 App 中显示，VS Code 扩展、`claude -p` 和云端会话里不会显示。

### 这个 mod 能访问什么

mod 运行在 Claude Code 进程内部，权限和你本人一样。用 `claude plugin validate` 可以在安装前列出它会调用的接口。这个 mod 只用到：

```
$.session.usage   读取用量、费用、限额、上下文
$.session.id      给本会话的账本命名
$.clock           计时、定时刷新
$.state / $.store 保存累计值、请求账本、限额读数和你的选择
$.ui              绘制横条、统计卡片、状态栏
$.command         注册 /usage-band 命令
```

没有文件读写、没有网络请求、不启动任何进程。

## 目录结构

```
.claude-plugin/marketplace.json   插件市场清单（cyan-mods）
plugins/usage-band/
├── .claude-plugin/plugin.json    插件清单
├── hooks/hooks.json              指向 hooks 模块
├── hooks/register.tsx            hooks：横条、状态栏、账本、统计面板
├── hooks/stats.ts                窗口计算：价值、进度、速度、曲线
├── hooks/cards.ts                统计卡片（SVG）
├── hooks/prices.ts               模型价格
├── hooks/format.ts               数字格式和配色工具
├── tests/                        claude plugin test
└── types/index.d.ts              状态类型定义
docs/                             效果图
CHANGELOG.md                      更新日志
```

## 更新日志

见 [CHANGELOG.md](CHANGELOG.md) 和 [Releases](https://github.com/iluolSNS/claude-code-usage-band/releases)。

## 许可证

[MIT](LICENSE)
