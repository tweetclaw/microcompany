import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import Toolbar from './Toolbar';
import MessageList from './MessageList';
import InputBox from './InputBox';
import { ToolIndicator } from './ToolIndicator';
import { Message, ToolCall } from '../types';
import './ChatInterface.css';

interface ChatInterfaceProps {
  workingDirectory: string | null;
  messages: Message[];
  isLoading: boolean;
  onWorkingDirectoryChange: (dir: string) => void;
  onMessagesChange: (messages: Message[]) => void;
  onLoadingChange: (loading: boolean) => void;
}

function ChatInterface({
  workingDirectory,
  messages,
  isLoading,
  onWorkingDirectoryChange,
  onMessagesChange,
  onLoadingChange,
}: ChatInterfaceProps) {
  const [currentToolCall, setCurrentToolCall] = useState<ToolCall | null>(null);

  // 设置事件监听器
  useEffect(() => {
    let unlistenChunk: (() => void) | null = null;
    let unlistenComplete: (() => void) | null = null;
    let unlistenToolStart: (() => void) | null = null;
    let unlistenToolEnd: (() => void) | null = null;

    const setupListeners = async () => {
      // 监听消息片段
      unlistenChunk = await listen<string>('message-chunk', (event) => {
        const last = messages[messages.length - 1];
        if (last && last.role === 'assistant' && last.isStreaming) {
          onMessagesChange([
            ...messages.slice(0, -1),
            { ...last, content: last.content + event.payload }
          ]);
        } else {
          onMessagesChange([
            ...messages,
            {
              id: Date.now().toString(),
              role: 'assistant',
              content: event.payload,
              timestamp: Date.now(),
              isStreaming: true,
            }
          ]);
        }
      });

      // 监听消息完成
      unlistenComplete = await listen('message-complete', () => {
        const last = messages[messages.length - 1];
        if (last && last.isStreaming) {
          onMessagesChange([...messages.slice(0, -1), { ...last, isStreaming: false }]);
        }
        onLoadingChange(false);
        setCurrentToolCall(null);
      });

      // 监听工具调用开始
      unlistenToolStart = await listen<{ tool: string; action: string }>(
        'tool-call-start',
        (event) => {
          setCurrentToolCall({
            tool: event.payload.tool,
            action: event.payload.action,
            status: 'running',
          });
        }
      );

      // 监听工具调用结束
      unlistenToolEnd = await listen<{ tool: string; success: boolean; result: string }>(
        'tool-call-end',
        (event) => {
          setCurrentToolCall({
            tool: event.payload.tool,
            action: '',
            status: event.payload.success ? 'success' : 'error',
            result: event.payload.result,
          });

          // 2秒后清除工具调用状态
          setTimeout(() => {
            setCurrentToolCall(null);
          }, 2000);
        }
      );
    };

    setupListeners();

    return () => {
      if (unlistenChunk) unlistenChunk();
      if (unlistenComplete) unlistenComplete();
      if (unlistenToolStart) unlistenToolStart();
      if (unlistenToolEnd) unlistenToolEnd();
    };
  }, [onMessagesChange, onLoadingChange]);

  const handleSendMessage = async (content: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    onMessagesChange([...messages, newMessage]);
    onLoadingChange(true);

    try {
      // 调用 Tauri 命令，流式响应通过事件接收
      await invoke<string>('send_message', { message: content });
    } catch (error) {
      console.error('Failed to send message:', error);

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `❌ 发送消息失败: ${error}`,
        timestamp: Date.now(),
      };

      onMessagesChange([...messages, newMessage, errorMessage]);
      onLoadingChange(false);
    }
  };

  return (
    <div className="chat-interface">
      <Toolbar
        workingDirectory={workingDirectory}
        onWorkingDirectoryChange={onWorkingDirectoryChange}
        onClearChat={() => onMessagesChange([])}
      />
      <MessageList messages={messages} isLoading={isLoading} />
      {currentToolCall && <ToolIndicator toolCall={currentToolCall} />}
      <InputBox
        onSendMessage={handleSendMessage}
        disabled={!workingDirectory || isLoading}
      />
    </div>
  );
}

export default ChatInterface;
