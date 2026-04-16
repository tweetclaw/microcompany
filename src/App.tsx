import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import WelcomePage from './components/WelcomePage';
import ChatInterface from './components/ChatInterface';
import { Settings } from './components/Settings';
import { Message } from './types';
import { ProviderConfig, SettingsData, normalizeSettingsData } from './types/settings';
import { bindWindowStatePersistence, restoreWindowState } from './utils/windowState';
import './App.css';

interface SessionSummary {
  session_id: string;
  working_directory: string;
  title: string;
  provider_id?: string | null;
  provider_name?: string | null;
  model?: string | null;
}

function App() {
  const [workingDirectory, setWorkingDirectory] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentSessionTitle, setCurrentSessionTitle] = useState<string | null>(null);
  const [currentProviderName, setCurrentProviderName] = useState<string | null>(null);
  const [currentModelName, setCurrentModelName] = useState<string | null>(null);
  const [availableProviders, setAvailableProviders] = useState<ProviderConfig[]>([]);
  const [selectedProviderValue, setSelectedProviderValue] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionListRefreshKey, setSessionListRefreshKey] = useState(0);
  const [isInitializing, setIsInitializing] = useState(false);
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const setupWindowState = async () => {
      await restoreWindowState();
      cleanup = await bindWindowStatePersistence();
    };

    void setupWindowState();

    return () => {
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    if (!isSettingsOpen) {
      loadConfig();
    }
  }, [isSettingsOpen]);

  const loadConfig = async () => {
    try {
      const rawConfig = await invoke('get_config');
      const config: SettingsData = normalizeSettingsData(rawConfig);
      const enabledProviders = config.providers.filter((provider) => provider.enabled && (provider.apiKey || provider.id === 'ollama'));
      setAvailableProviders(config.providers);

      if (enabledProviders.length === 0) {
        setSelectedProviderValue('');
        return;
      }

      const activeProvider = config.providers.find((provider) => provider.id === config.activeProvider) || enabledProviders[0];
      const nextValue = `${activeProvider.id}::${activeProvider.model}`;

      setSelectedProviderValue((prev) => {
        if (!prev) return nextValue;
        const stillExists = enabledProviders.some((provider) => `${provider.id}::${provider.model}` === prev);
        return stillExists ? prev : nextValue;
      });
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  };

  const handleDirectorySelected = async (directory: string) => {
    setWorkingDirectory(directory);
    setCurrentSessionId(null);
    setCurrentSessionTitle(null);
    setCurrentProviderName(null);
    setCurrentModelName(null);
    setMessages([]);
    setHasActiveSession(false);
  };

  const handleSessionSelected = async (sessionId: string) => {
    if (!workingDirectory) return;

    setIsInitializing(true);
    try {
      const sessions = await invoke<SessionSummary[]>('list_sessions', { workingDir: workingDirectory });
      const session = sessions.find((item) => item.session_id === sessionId);

      if (!session) {
        throw new Error('会话不存在或不属于当前工作目录');
      }

      await invoke<string>('init_session', {
        workingDir: workingDirectory,
        sessionId,
        providerId: null,
      });

      const storedMessages = await invoke<Array<{ role: string; content: string; timestamp: number }>>('load_messages', {
        sessionId,
      });
      const loadedMessages: Message[] = storedMessages.map((msg, index) => ({
        id: `${msg.timestamp}-${index}`,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        timestamp: msg.timestamp * 1000,
      }));

      setCurrentSessionId(sessionId);
      setCurrentSessionTitle(session.title);
      setCurrentProviderName(session.provider_name || null);
      setCurrentModelName(session.model || null);
      if (session.provider_id && session.model) {
        setSelectedProviderValue(`${session.provider_id}::${session.model}`);
      }
      setMessages(loadedMessages);
      setHasActiveSession(true);
      setSessionListRefreshKey((prev) => prev + 1);
    } catch (error) {
      console.error('Failed to load session:', error);
      alert(`Failed to load session: ${error}`);
    } finally {
      setIsInitializing(false);
    }
  };

  const handleNewChat = async () => {
    if (!workingDirectory || !selectedProviderValue) return;

    setIsInitializing(true);
    try {
      const [providerId] = selectedProviderValue.split('::');
      const provider = availableProviders.find((item) => `${item.id}::${item.model}` === selectedProviderValue);

      const sessionId = await invoke<string>('init_session', {
        workingDir: workingDirectory,
        sessionId: null,
        providerId,
      });
      setCurrentSessionId(sessionId);
      setCurrentSessionTitle('Untitled');
      setCurrentProviderName(provider?.name || null);
      setCurrentModelName(provider?.model || null);
      setMessages([]);
      setHasActiveSession(true);
      setSessionListRefreshKey((prev) => prev + 1);
    } catch (error) {
      console.error('Failed to create new session:', error);
      alert(`创建新会话失败: ${error}`);
    } finally {
      setIsInitializing(false);
    }
  };

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
        currentSessionId={currentSessionId}
        currentSessionTitle={currentSessionTitle}
        currentProviderName={currentProviderName}
        currentModelName={currentModelName}
        availableProviders={availableProviders}
        selectedProviderValue={selectedProviderValue}
        messages={messages}
        onMessagesChange={setMessages}
        sessionListRefreshKey={sessionListRefreshKey}
        onSessionSelected={handleSessionSelected}
        onProviderChange={setSelectedProviderValue}
        onNewChat={handleNewChat}
        hasActiveSession={hasActiveSession}
        onSettingsClick={() => setIsSettingsOpen(true)}
      />
      <Settings isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}

export default App;
