# MicroCompany (Claude Code GUI)

MicroCompany 是一个为 Claurst (Claude Code) 打造的桌面图形界面版本，旨在为开发者提供一个更美观、更直观的 AI 辅助编程环境。

## 技术栈

- **桌面框架**: [Tauri 2.0](https://tauri.app/) (高性能、安全、极小的包体积)
- **前端工具**: [Vite](https://vitejs.dev/) + [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **后端逻辑**: [Rust](https://www.rust-lang.org/) (集成 Claurst crates)
- **视觉语言**: 自定义科技感现代设计规范 (深色模式、玻璃态、渐变动效)

## 环境准备

开始开发前，请确保你的系统已安装以下工具：

1. **Rust 运行环境**:
   ```bash
   # 安装 Rust 工具链
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   
   # 加载环境变量
   source $HOME/.cargo/env
   ```

2. **Node.js**: 推荐使用 LTS 版本。

3. **系统依赖 (macOS)**:
   ```bash
   xcode-select --install
   ```

## 开发指南

### 启动开发环境

1. **设置环境变量 (仅需运行一次)**:
   为了让终端永久识别 `cargo` 命令，请运行：
   ```bash
   echo 'export PATH="$HOME/.cargo/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
   ```

2. **安装依赖**:
   ```bash
   npm install
   ```

3. **启动调试窗口**:
   ```bash
   npm run tauri dev
   ```
   *注意：首次启动会编译 Rust 后端，可能需要 3-5 分钟。*

### 项目结构

- `src/`: React 前端代码 (UI 组件、样式、Hooks)
- `src-tauri/`: Rust 后端代码 (本地接口、Claurst 集成、窗口管理)
- `docs/`: 项目文档 (开发计划、视觉规范、需求定义)
- `dist/`: 前端构建产物 (由 Vite 生成)

## 常用命令

- `npm run dev`: 仅在一个网页窗口中预览 UI (不支持本地文件访问)
- `npm run tauri dev`: 启动完整的原生桌面程序 (支持本地接口)
- `npm run tauri build`: 打包生成正式的安装包 (.app / .exe)

## 路线图

- [x] 阶段 1: UI 设计和原型开发
- [ ] 阶段 2: 前后端通信接口定义
- [ ] 阶段 3: Mock 数据后端集成
- [ ] 阶段 4: Claurst 真实引擎对接
- [ ] 阶段 5: Markdown 渲染与性能优化
