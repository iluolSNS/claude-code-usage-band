# usage-band

[English](README.en.md) | 中文

一个 Claude Code **mod**：在输入框上方用一排彩色胶囊，实时显示限额、token、速度、费用和上下文占用。

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

进度条颜色：限额用到 90% 以上变红，用量比时间进度快 15% 以上变黄；上下文 60% 以上变黄，80% 以上变红。

### 自适应宽度

始终保持一行。窗口变窄时按顺序压缩：缩短进度条 → 去掉时钟图标、时间改为紧凑写法 → 缩小字号 → 去掉进度条。窗口变宽时自动恢复。

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/band-narrow-dark.png">
  <img alt="窄窗口下的紧凑布局" src="docs/band-narrow-light.png" width="600">
</picture>

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

选择会被记住，之后的会话也沿用。Claude 正在回复时也可以切换。

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
$.clock           计时、定时刷新
$.state / $.store 保存累计值和显示模式
$.ui              绘制横条、状态栏
$.command         注册 /usage-band 命令
```

没有文件读写、没有网络请求、不启动任何进程。

## 目录结构

```
.claude-plugin/marketplace.json   插件市场清单（cyan-mods）
plugins/usage-band/
├── .claude-plugin/plugin.json    插件清单
├── hooks/hooks.json              指向 hooks 模块
├── hooks/register.tsx            全部逻辑
└── types/index.d.ts              状态类型定义
docs/                             效果图
```

## 许可证

[MIT](LICENSE)
