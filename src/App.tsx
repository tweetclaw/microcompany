import React, { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import WelcomePage from './components/WelcomePage';
import ChatInterface from './components/ChatInterface';
import { Message } from './types';
import './App.css';

function App() {
  const [workingDirectory, setWorkingDirectory] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);

  const handleDirectorySelected = async (directory: string) => {
    setIsInitializing(true);
    try {
      await invoke('init_session', { workingDir: directory });
      setWorkingDirectory(directory);
    } catch (error) {
      console.error('Failed to initialize session:', error);
      alert(`Failed to initialize session: ${error}`);
    } finally {
      setIsInitializing(false);
    }
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
      />
    </div>
  );
}

export default App;
