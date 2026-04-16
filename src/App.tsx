import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import WelcomePage from './components/WelcomePage';
import ChatInterface from './components/ChatInterface';
import { Settings } from './components/Settings';
import { Message } from './types';
import { ProviderConfig, ProviderInfo, SettingsData, ensureValidActiveProvider, isProviderUsable, normalizeProviderInfo, normalizeSettingsData, toBackendSettingsData } from './types/settings';
import { bindWindowStatePersistence, restoreWindowState } from './utils/windowState';
import { ThemePreference, applyTheme, loadThemePreference, resolveTheme, saveThemePreference, watchSystemTheme } from './utils/themeState';
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
  const [providerCatalog, setProviderCatalog] = useState<ProviderInfo[]>([]);
  const [settingsConfig, setSettingsConfig] = useState<SettingsData | null>(null);
  const [selectedProviderValue, setSelectedProviderValue] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionListRefreshKey, setSessionListRefreshKey] = useState(0);
  const [isInitializing, setIsInitializing] = useState(false);
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>('system');

  // 草稿对话状态：用于"新建"时不立即创建后端 session
  const [isDraftConversation, setIsDraftConversation] = useState(false);

  useEffect(() => {
    loadConfig();
    loadProviderCatalog();

    // Initialize theme
    const savedTheme = loadThemePreference();
    setThemePreference(savedTheme);
    applyTheme(resolveTheme(savedTheme));
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
    if (themePreference === 'system') {
      const unwatch = watchSystemTheme((systemTheme) => {
        applyTheme(systemTheme);
      });
      return unwatch;
    } else {
      applyTheme(themePreference);
    }
  }, [themePreference]);

  useEffect(() => {
    if (!isSettingsOpen) {
      loadConfig();
    }
  }, [isSettingsOpen]);

  const loadConfig = async () => {
    try {
      const rawConfig = await invoke('get_config');
      const config = ensureValidActiveProvider(normalizeSettingsData(rawConfig));
      const enabledProviders = config.providers.filter((provider) => isProviderUsable(provider, providerCatalog.find((item) => item.id === provider.id)));
      setSettingsConfig(config);
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

  const loadProviderCatalog = async () => {
    try {
      const providers = await invoke<unknown[]>('get_available_providers');
      setProviderCatalog(providers.map(normalizeProviderInfo));
    } catch (error) {
      console.error('Failed to load available providers:', error);
    }
  };

  const saveSettingsConfig = async (nextConfig: SettingsData) => {
    const validConfig = ensureValidActiveProvider(nextConfig);
    await invoke('save_config', { config: toBackendSettingsData(validConfig) });
    setSettingsConfig(validConfig);
    setAvailableProviders(validConfig.providers);

    // Update theme if changed
    if (validConfig.theme && validConfig.theme !== themePreference) {
      setThemePreference(validConfig.theme);
      saveThemePreference(validConfig.theme);
      applyTheme(resolveTheme(validConfig.theme));
    }

    const enabledProviders = validConfig.providers.filter((provider) => isProviderUsable(provider, providerCatalog.find((item) => item.id === provider.id)));
    if (enabledProviders.length === 0) {
      setSelectedProviderValue('');
      return;
    }

    const activeProvider = validConfig.providers.find((provider) => provider.id === validConfig.activeProvider) || enabledProviders[0];
    const nextValue = `${activeProvider.id}::${activeProvider.model}`;
    setSelectedProviderValue((prev) => {
      const stillExists = enabledProviders.some((provider) => `${provider.id}::${provider.model}` === prev);
      return stillExists ? prev : nextValue;
    });
  };

  useEffect(() => {
    if (providerCatalog.length > 0) {
      void loadConfig();
    }
  }, [providerCatalog]);

  const handleDirectorySelected = async (directory: string) => {
    setWorkingDirectory(directory);
    setCurrentSessionId(null);
    setCurrentSessionTitle(null);
    setCurrentProviderName(null);
    setCurrentModelName(null);
    setMessages([]);
    setHasActiveSession(false);
    setIsDraftConversation(false);
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
      setIsDraftConversation(false);
      setSessionListRefreshKey((prev) => prev + 1);
    } catch (error) {
      console.error('Failed to load session:', error);
      alert(`Failed to load session: ${error}`);
    } finally {
      setIsInitializing(false);
    }
  };

  const handleNewChatWithModel = async (modelValue: string) => {
    if (!workingDirectory) return;

    // 根据选中的模型创建草稿对话
    setSelectedProviderValue(modelValue);
    const provider = availableProviders.find((item) => `${item.id}::${item.model}` === modelValue);
    setCurrentProviderName(provider?.name || null);
    setCurrentModelName(provider?.model || null);

    // 设置为草稿状态
    setCurrentSessionId(null);
    setCurrentSessionTitle(null);
    setMessages([]);
    setIsDraftConversation(true);
    setHasActiveSession(true);
  };

  // 确保当前有一个真实的后端 session（懒创建）
  const ensureActiveSession = async (): Promise<string | null> => {
    // 如果已经有真实 session，直接返回
    if (currentSessionId && !isDraftConversation) {
      return currentSessionId;
    }

    // 如果是草稿且已选模型，创建真实 session
    if (isDraftConversation && selectedProviderValue && workingDirectory) {
      try {
        const [providerId] = selectedProviderValue.split('::');
        const provider = availableProviders.find((item) => `${item.id}::${item.model}` === selectedProviderValue);

        const sessionId = await invoke<string>('init_session', {
          workingDir: workingDirectory,
          sessionId: null,
          providerId,
        });

        // 转换草稿为真实 session
        setCurrentSessionId(sessionId);
        setCurrentSessionTitle('Untitled');
        setCurrentProviderName(provider?.name || null);
        setCurrentModelName(provider?.model || null);
        setIsDraftConversation(false);
        setHasActiveSession(true);
        setSessionListRefreshKey((prev) => prev + 1);

        return sessionId;
      } catch (error) {
        console.error('Failed to create session:', error);
        throw error;
      }
    }

    return null;
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
        onNewChatWithModel={handleNewChatWithModel}
        hasActiveSession={hasActiveSession}
        isDraftConversation={isDraftConversation}
        onEnsureSession={ensureActiveSession}
        onSettingsClick={() => setIsSettingsOpen(true)}
      />
      <Settings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={settingsConfig}
        availableProviders={providerCatalog}
        onSaveConfig={saveSettingsConfig}
        themePreference={themePreference}
        onThemeChange={(theme) => {
          setThemePreference(theme);
          saveThemePreference(theme);
          applyTheme(resolveTheme(theme));
        }}
      />
    </div>
  );
}

export default App;
