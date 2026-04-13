import React, { useState } from 'react';
import ChatInterface from './components/ChatInterface';
import { Message } from './types';
import './App.css';

function App() {
  const [workingDirectory, setWorkingDirectory] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  return (
    <div className="app">
      <ChatInterface
        workingDirectory={workingDirectory}
        messages={messages}
        isLoading={isLoading}
        onWorkingDirectoryChange={setWorkingDirectory}
        onMessagesChange={setMessages}
        onLoadingChange={setIsLoading}
      />
    </div>
  );
}

export default App;
