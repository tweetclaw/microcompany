import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import WelcomePage from './components/WelcomePage';
import ChatInterface from './components/ChatInterface';
import { Message } from './types';
import './App.css';

function App() {
  const [workingDirectory, setWorkingDirectory] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [hasActiveSession, setHasActiveSession] = useState(false);

  const handleDirectorySelected = async (directory: string) => {
    setIsInitializing(true);
    try {
      // 初始化会话,不传 session_id 表示创建新会话
      const sessionId = await invoke<string>('init_session', {
        workingDir: directory,
        sessionId: null
      });
      setWorkingDirectory(directory);
      setCurrentSessionId(sessionId);
      setMessages([]);
      setHasActiveSession(false);
    } catch (error) {
      console.error('Failed to initialize session:', error);
      alert(`Failed to initialize session: ${error}`);
    } finally {
      setIsInitializing(false);
    }
  };

  const handleSessionSelected = async (sessionId: string) => {
    setIsInitializing(true);
    try {
      // 加载该会话的历史消息
      const storedMessages = await invoke<Array<{role: string, content: string, timestamp: number}>>('load_messages', {
        sessionId
      });
      const loadedMessages: Message[] = storedMessages.map((msg, index) => ({
        id: `${msg.timestamp}-${index}`,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        timestamp: msg.timestamp * 1000,
      }));

      // 从存储中获取会话信息以获取 working_directory
      const sessions = await invoke<Array<{session_id: string, working_directory: string, title: string}>>('list_sessions');
      const session = sessions.find(s => s.session_id === sessionId);

      if (session) {
        // 使用现有的 session_id 重新初始化会话
        await invoke<string>('init_session', {
          workingDir: session.working_directory,
          sessionId: sessionId
        });
        setWorkingDirectory(session.working_directory);
        setCurrentSessionId(sessionId);
        setMessages(loadedMessages);
        setHasActiveSession(true);
      }
    } catch (error) {
      console.error('Failed to load session:', error);
      alert(`Failed to load session: ${error}`);
    } finally {
      setIsInitializing(false);
    }
  };

  const handleNewChat = () => {
    // 新建对话:清空消息列表,设置为有活动会话
    setMessages([]);
    setHasActiveSession(true);
  };

  // Show welcome page if no working directory is selected
  if (!workingDirectory) {
    return (
      <div className="app">
        {isInitializing ? (
          <div className="initializing-overlay">
            <div className="initializing-spinner"></div>
            <p>Initializing session...</p>
          </div>
        ) : (
          <WelcomePage onDirectorySelected={handleDirectorySelected} />
        )}
      </div>
    );
  }

  return (
    <div className="app">
      <ChatInterface
        workingDirectory={workingDirectory}
        messages={messages}
        isLoading={isLoading}
        onMessagesChange={setMessages}
        onLoadingChange={setIsLoading}
        onSessionSelected={handleSessionSelected}
        onNewChat={handleNewChat}
        hasActiveSession={hasActiveSession}
      />
    </div>
  );
}

export default App;
