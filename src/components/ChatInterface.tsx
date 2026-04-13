import React from 'react';
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
  const handleSendMessage = (content: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    onMessagesChange([...messages, newMessage]);
    onLoadingChange(true);

    // Mock AI response
    setTimeout(() => {
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'This is a mock response. The real implementation will connect to Claurst.',
        timestamp: Date.now(),
      };
      onMessagesChange([...messages, newMessage, aiMessage]);
      onLoadingChange(false);
    }, 1500);
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
