import React, { useEffect, useState, useRef } from 'react';
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
  onMessagesChange: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  onLoadingChange: (loading: boolean) => void;
}

function ChatInterface({
  workingDirectory,
  messages,
  isLoading,
  onMessagesChange,
  onLoadingChange,
}: ChatInterfaceProps) {
  const [currentToolCall, setCurrentToolCall] = useState<ToolCall | null>(null);

  // Use refs to always access the latest callbacks
  const onMessagesChangeRef = useRef(onMessagesChange);
  const onLoadingChangeRef = useRef(onLoadingChange);

  // Update refs when callbacks change
  useEffect(() => {
    onMessagesChangeRef.current = onMessagesChange;
    onLoadingChangeRef.current = onLoadingChange;
  }, [onMessagesChange, onLoadingChange]);

  // 设置事件监听器
  useEffect(() => {
    let unlistenChunk: (() => void) | null = null;
    let unlistenComplete: (() => void) | null = null;
    let unlistenToolStart: (() => void) | null = null;
    let unlistenToolEnd: (() => void) | null = null;

    const setupListeners = async () => {
      // 监听消息片段
      unlistenChunk = await listen<string>('message-chunk', (event) => {
        onMessagesChangeRef.current((currentMessages: Message[]) => {
          const last = currentMessages[currentMessages.length - 1];

          // If the last message is an assistant message (streaming or not), append to it
          if (last && last.role === 'assistant') {
            // Replace "💭 思考中..." with actual content on first chunk
            const isThinking = last.content.includes('思考中');
            const newContent = isThinking
              ? event.payload
              : last.content + event.payload;

            return [
              ...currentMessages.slice(0, -1),
              { ...last, content: newContent, isStreaming: true }
            ];
          }

          // If no assistant message exists, create one with the first chunk
          return [
            ...currentMessages,
            {
              id: Date.now().toString(),
              role: 'assistant',
              content: event.payload,
              timestamp: Date.now(),
              isStreaming: true,
            }
          ];
        });
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
      if (unlistenToolStart) unlistenToolStart();
      if (unlistenToolEnd) unlistenToolEnd();
    };
  }, []); // Empty deps - listeners should only be set up once

  const handleSendMessage = async (content: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    // Add user message only
    onMessagesChange((prev) => [...prev, newMessage]);
    onLoadingChange(true);

    try {
      // 调用 Tauri 命令，流式响应通过事件接收
      await invoke<string>('send_message', { message: content });

      // 消息发送完成后，标记最后一条消息为非流式状态并隐藏加载指示器
      // 增加延迟确保所有流式事件都已处理完成
      setTimeout(() => {
        onMessagesChange((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant') {
            return [...prev.slice(0, -1), { ...last, isStreaming: false }];
          }
          return prev;
        });
        onLoadingChange(false);
        setCurrentToolCall(null);
      }, 500);
    } catch (error) {
      console.error('Failed to send message:', error);

      // Add error message
      onMessagesChange((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: `❌ 发送消息失败: ${error}`,
          timestamp: Date.now(),
        }
      ]);
      onLoadingChange(false);
      setCurrentToolCall(null);
    }
  };

  const handleClearChat = () => {
    onMessagesChange([]);
  };

  return (
    <div className="chat-interface">
      <Toolbar
        workingDirectory={workingDirectory}
        onClearChat={handleClearChat}
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
