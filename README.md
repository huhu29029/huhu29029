# Novel Memory Engine

Novel Memory Engine 是一个面向长篇小说作者的本地大纲管理软件。它用于导入小说、组织章节、维护摘要和大纲、跟踪角色状态、伏笔与一致性问题。

第一阶段只提供基础工程结构和最小可运行界面，不接入任何 AI API，也不实现 AI 续写。

## 技术栈

- React + TypeScript
- Vite
- Tauri
- SQLite
- Rust + rusqlite

## 环境要求

需要先安装：

- Node.js 18 或更高版本
- npm
- Rust stable toolchain
- Tauri 对应平台依赖

Windows 上通常需要安装 Microsoft C++ Build Tools 和 Rust。Tauri 的系统依赖请参考官方文档。

## 安装

```bash
npm install
```

## 开发运行

```bash
npm run tauri dev
```

项目也保留了等价脚本：

```bash
npm run tauri:dev
```

也可以直接运行前端开发服务器：

```bash
npm run dev
```

## 构建

```bash
npm run build
npm run tauri build
```

## 目录结构

```text
.
├── src/                         # React 前端
│   ├── data/                    # 临时演示数据
│   ├── types/                   # TypeScript 领域类型
│   ├── App.tsx                  # 三栏基础布局
│   ├── main.tsx                 # 前端入口
│   └── styles.css               # 基础样式
├── src-tauri/                   # Tauri 桌面端
│   ├── migrations/schema.sql    # SQLite 初始 schema
│   ├── src/lib.rs               # Tauri 初始化与数据库创建
│   ├── src/main.rs              # Tauri 入口
│   ├── Cargo.toml
│   └── tauri.conf.json
├── AGENTS.md                    # 工程代理开发规则
├── package.json
└── README.md
```

## 数据库

应用启动时会在 Tauri app data 目录创建本地 SQLite 数据库：

```text
novel_memory_engine.sqlite3
```

当前 schema 包含：

- projects
- chapters
- chapter_summaries
- global_outlines
- characters
- plot_threads
- foreshadowing
- consistency_issues

## 当前阶段边界

本阶段不做：

- 登录
- 云同步
- 支付
- 多人协作
- AI 摘要
- AI 续写
- AI 剧情偏移检测

后续应优先补齐本地项目与章节的真实 CRUD，再逐步接入导入、摘要和一致性检查。
