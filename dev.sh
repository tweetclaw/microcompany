#!/bin/bash

# MicroCompany 开发启动脚本
# 功能：清空日志文件并启动开发服务器，将所有输出重定向到日志文件

LOG_FILE="dev.log"

echo "🧹 清空日志文件..."
> "$LOG_FILE"

echo "🚀 启动 MicroCompany 开发服务器..."
echo "📝 日志输出到: $LOG_FILE"
echo ""
echo "提示："
echo "  - 查看日志: tail -f dev.log"
echo "  - 停止服务: Ctrl+C"
echo ""

# 启动开发服务器并将所有输出重定向到日志文件
npm run tauri dev 2>&1 | tee "$LOG_FILE"
