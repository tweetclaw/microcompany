#!/bin/bash

# MicroCompany 生产模式启动脚本
# 功能：编译生产版本并运行，不会因文件变更而重启

LOG_FILE="dev.log"
APP_PATH="./src-tauri/target/release/bundle/macos/MicroCompany.app/Contents/MacOS/MicroCompany"

echo "🔨 编译生产版本..."
npm run tauri build

if [ ! -f "$APP_PATH" ]; then
    echo "❌ 编译失败或找不到应用程序"
    exit 1
fi

echo "🧹 清空日志文件..."
> "$LOG_FILE"

echo "🚀 启动 MicroCompany（生产模式）..."
echo "📝 日志输出到: $LOG_FILE"
echo ""
echo "提示："
echo "  - 查看日志: tail -f dev.log"
echo "  - 停止服务: 关闭应用窗口或 killall MicroCompany"
echo "  - 此模式下修改代码不会触发重启"
echo ""

# 启动应用并将输出重定向到日志文件
"$APP_PATH" > "$LOG_FILE" 2>&1
