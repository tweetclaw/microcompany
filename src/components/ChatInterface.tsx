import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import Toolbar from './Toolbar';
import MessageList from './MessageList';
import InputBox from './InputBox';
import { Message } from '../types';
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
      // Call the real Tauri command
      const response = await invoke<string>('send_message', { message: content });

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
      };

      onMessagesChange([...messages, newMessage, aiMessage]);
    } catch (error) {
      console.error('Failed to send message:', error);

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `❌ 发送消息失败: ${error}`,
        timestamp: Date.now(),
      };

      onMessagesChange([...messages, newMessage, errorMessage]);
    } finally {
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
      <InputBox
        onSendMessage={handleSendMessage}
        disabled={!workingDirectory || isLoading}
      />
    </div>
  );
}

export default ChatInterface;
