#!/bin/bash

# MicroCompany 开发启动脚本
# 功能：检查并清理端口冲突，清空日志文件并启动开发服务器

LOG_FILE="dev.log"
PORT=1420

# 检查端口是否被占用
check_port() {
    lsof -ti:$PORT > /dev/null 2>&1
    return $?
}

# 杀死占用端口的进程
kill_port_process() {
    echo "🔍 检测到端口 $PORT 被占用..."
    local pids=$(lsof -ti:$PORT)
    if [ -n "$pids" ]; then
        echo "🔪 正在终止占用端口的进程: $pids"
        kill -9 $pids 2>/dev/null
        sleep 1
        if check_port; then
            echo "❌ 无法终止进程，请手动检查"
            exit 1
        else
            echo "✅ 端口已释放"
        fi
    fi
}

# 检查并清理端口
if check_port; then
    kill_port_process
fi

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
