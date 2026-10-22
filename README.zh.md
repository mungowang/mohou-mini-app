# 墨猴 · Mohou

[English](README.md) | 中文

[![check](https://github.com/mungowang/mohou-mini-app/actions/workflows/check.yml/badge.svg)](https://github.com/mungowang/mohou-mini-app/actions/workflows/check.yml)
[![license](https://img.shields.io/badge/license-MIT-blue)](package.json)
[![node](https://img.shields.io/badge/node-22.19%20%7C%2024-339933)](package.json)
[![pnpm](https://img.shields.io/badge/pnpm-11.7.0-F69220)](package.json)
[![platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-111111)](docs/architecture/decisions.md)

墨猴，独属于你的个人小程序创造和运行平台！

- 本平台提供创作工具和引导技能：你给出想法，使用自己熟悉的 AI Agent 构建小程序。
- 平台负责管理和运行：一套稳定可靠的运行框架，即开即用！
- 随心所欲的构建属于自己的日常工作生活的首页面板，不同的情景定制不同的工作台！

![面板里的阶段看板](docs/images/board.png)

*阶段看板，从库里点开。上面是数量，下面四列，旁边一个让模型记工时的按钮。*

这些 app 会回头用这台机器上的东西。`ctx.llm` 和 `ctx.agent` 走 Shell 启动时注入的 provider（Echo；装了 Pi 就是 Pi）。`ctx.mcp` 调你已经接好的 MCP。`ctx.bash` 在这台电脑上跑。

## 能做什么

你描述要什么。agent 搭出来、打开、把报错读回去，改到屏幕上是你要的样子。

下面这些只要有宿主就能用。你自己的系统接上来之后，同样的做法也能盖住。

| 你说一句 | 你得到 |
|---|---|
| 「做个信息雷达，源我贴给你。按我在意的程度排，打开先看到一段简报。」 | 源在 app 里就能改，每条有分数，简报来自 `ctx.llm`。页面用 `ctx.http` 去拉。key 不写进界面。 |
| 「今天的事散在群、邮件和三个表里。一个屏，告诉我先干哪个。」 | 一张台子。清单存在这台机器上。 |
| 「这个表格丢给你，哪里变了、哪里不对劲？」 | 拖进来，解析库只用 `mini_app_install` 装进这一个 app，一段人话总结，每份都留着好跟下一份比。 |
| 「订单、申请、稿件按阶段追，老忘哪个卡住了。」 | 按你的阶段排看板，每条有备注，一列专门放没人动的。 |
| 「每天记一行：花钱、锻炼、睡眠。然后给我看这一周。」 | 本地日志、连续天数、一张图、一周的书面回顾。 |
| 「周五那点杂事给我一个按钮：整理下载、出发票 PDF、备份这个文件夹。」 | `ctx.bash` 在这台机器上跑，输出回到 app 里。 |

工具接上之后，同一套做法落到它们身上：按你的 JQL 排的 Jira 看板、内网 API 做成的表单、CI 挂在哪一步、工时写回去。

创作 skill 里带了起步门面，所以上面这些不是从空目录开始：今日台子、阶段看板、信息雷达、表格台、执行器、一键杂事、值班屏、骨架，还有一张首页。见 [skills/mohou-mini-app/templates/](skills/mohou-mini-app/templates/)。

## 一个 app 是怎么做出来的

agent 用宿主的 `mini_app_*` 工具。源码用它自己的文件工具写。skill 不再另造一套写文件、改文件、删文件的工具。

1. `mini_app_register` 建出目录。agent 把 `manifest.json`、`ui.tsx`、`main.api.ts` 写进去。
2. `mini_app_reload` 编译。脏树编译成功，会给这个 app 的历史记一笔。
3. `mini_app_call` 调一个方法。`mini_app_errors` 和 `mini_app_view_eval` 读报错和实况 DOM，不靠对着截图猜。
4. `mini_app_open` 把它放进库，并开一个标签。

`mini_app_install` 把一个真的 npm 包装进这个 app 自己的 `node_modules`，并记进它的历史。不碰全局。

## 对话里的一份 HTML 是另一回事

Agent 早就能写 HTML，也能顺手起一个 Flask。那些是一次性的。HTML 关标签就没了。Python 站从此归你养着。小程序站在宿主这一侧。

| | 对话里的 HTML | Agent 起的本地网站 | 小程序 |
|---|---|---|---|
| 下周还在吗 | 关标签就没了 | 进程和端口归你盯 | 库里的一个 app，落在盘上，自带历史 |
| Agent 修正在跑的界面 | 来回传截图 | 重启碰运气 | 报错和实况 DOM 是它能调的工具 |
| 按钮调用模型 | 自己把 key 贴进页面 | 自己接 provider | `ctx.llm`，用 Shell 启动的那个 provider |
| 按钮跑一轮 agent | 不能 | 自己搓 tool loop | `ctx.agent`，一次，进度流进 app |
| 已经接好的 MCP | 不能 | 每个 app 重新鉴权 | `ctx.mcp(serverId, toolName, args)` |
| 屏幕和宿主是一套 | 模型当时想用的 Tailwind | 模型当时想用的 CSS | 列表、看板、设置用组件库。想自己排一页，也可以一个组件都不用 |

半年后打开那个 app，说哪里不对。报错、实况 DOM 和这个 app 的历史都在。

## App 拿到什么

`main.api.ts` 从宿主拿到 `ctx`。这些以你的身份跑：

```ts
ctx.llm(prompt, { schema, system, signal })      // 返回 string
ctx.agent(goal, { streamTo, maxIterations })     // 一轮 agent，事件进 UI
ctx.mcp(serverId, toolName, args)                // 已连接的 MCP
ctx.http(url, opts)                              // { ok, status, headers, text, json }
ctx.bash(cmd)                                    // { stdout, stderr, exitCode }
ctx.pwsh(cmd)                                    // Windows 那一侧
ctx.storage                                      // kv；有 schema 文件之后是 SQL
ctx.push(event, payload)                         // 后端到这个 app 所有开着的视图
ctx.signal                                       // 停止会真的停
```

`ctx.agent` 改的是按钮能干什么。按钮可以是「去把这事查清楚，要用的工具自己拿，完了告诉我」，每一步都出现在 app 里。

没有 `ctx.tool`，也没有 `listTools`。工具留在 runtime provider 上。换模型不换这套工具。

## 组件库，要用的时候再用

`@mohou/ui` 是列表、看板、设置、仪表盘时对着写的。颜色走宿主的 token，新 app 不会再造一套色板。目录是从组件库生成的：[skills/mohou-mini-app/references/catalog.md](skills/mohou-mini-app/references/catalog.md)。

页面也可以是原生元素加 Tailwind，或者混用。一个组件都不用，同样是一个合法的 app。重编辑器按需加载，不开代码编辑器的 app 不会带上那套引擎。

## 三个文件

```tsx
// ui.tsx
import { Button, useApp } from "@mohou/ui";

export default function Ui() {
  const { call } = useApp();
  return <Button onClick={() => call("ping")}>ping</Button>;
}
```

```ts
// main.api.ts
import { defineApp } from "@mohou/contract";

export default defineApp({
  name: "Ping",
  description: "one-line app",
  api: { ping: async (ctx) => ctx.appId },
});
```

界面引 `@mohou/ui` 和 `react`。后端引 `@mohou/contract`。辅助代码放 `ui/`（仅界面）、`api/`（仅后端）或 `shared/`（纯代码，两边都能用）。相对路径不能跳出 app 目录。

## 试用

Node.js 22.19 或更新（或 24+）。pnpm 11.7.0。要编窗口才需要 Rust。没有 Docker，没有 Python，没有数据库。

```bash
git clone <这个仓库> && cd mohou-mini-app
pnpm install
pnpm build:panel && pnpm build:window
pnpm dev:host
```

`pnpm dev:host` 打开窗口。关掉窗口，进程退出。app 落在 `~/.mini-app/runtime`。

Mac 上如果已经有 Node.js 22+，`pnpm dist:app` 会写出 `artifacts/app/Mohou.app`、一个 zip 和一个 dmg。产品也面向 Windows。这条命令不打 Windows 安装包。

面板起来之后，把这段贴给助手：

```
给我做一个「AI 风向雷达」小程序：

1. 数据源用公开的那些（各家官方 blog、论文榜、值得看的科技媒体），拉回来让模型按和我的相关度打分。
2. 顶部一块：一张趋势图，一句话判断，3 到 5 条重点。重点点得开原文。
3. 能按主题筛，能收藏，能看过去某一天。
4. 数据源我在 app 里自己管，别写死。
5. 留白够，层级清楚，少装饰。浅色和深色都要看得过去。
```

![库](docs/images/library.png)

*库：两个 app，各自有历史。可以搜，可以换卡片样式，点开就是一个标签。*

## 包和文档

包的角色：[packages/README.md](packages/README.md)。产品做什么：[docs/product/features.md](docs/product/features.md)。命令：[docs/development.md](docs/development.md)。助手读的文件：[skills/mohou-mini-app/SKILL.md](skills/mohou-mini-app/SKILL.md)。

`pnpm run check` 是 lint、typecheck、覆盖率门禁，加上 skill 检查。

## 信任

这是机主自己用的本机软件。小程序以你的身份运行。`ctx.bash`、`ctx.http`、`ctx.llm` 是真的。iframe 只保证一个坏掉的视图不会带走面板。它不把这台机器关起来。本项目不限制小程序在你电脑上能做什么。

## 许可证

MIT，以 `package.json` 里的声明为准。
