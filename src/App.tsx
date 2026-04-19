import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import WelcomePage from './components/WelcomePage';
import MainNavigation, { NavigationMode } from './components/MainNavigation';
import NormalModeLayout from './components/NormalModeLayout';
import TaskModeLayout from './components/TaskModeLayout';
import TaskBuilder from './components/TaskBuilder';
import ForwardLatestReplyModal from './components/ForwardLatestReplyModal';
import ModelDropdown from './components/ModelDropdown';
import { Settings } from './components/Settings';
import { Message, Task } from './types';
import { ProviderConfig, ProviderInfo, SettingsData, ensureValidActiveProvider, isProviderUsable, normalizeProviderInfo, normalizeSettingsData, toBackendSettingsData } from './types/settings';
import { bindWindowStatePersistence, restoreWindowState } from './utils/windowState';
import { ThemePreference, applyTheme, loadThemePreference, saveThemePreference } from './utils/themeState';
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
  const [themePreference, setThemePreference] = useState<ThemePreference>('dark');

  // 草稿对话状态：用于"新建"时不立即创建后端 session
  const [isDraftConversation, setIsDraftConversation] = useState(false);

  // Navigation mode
  const [navigationMode, setNavigationMode] = useState<NavigationMode>('normal');

  // Task 状态
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [currentTaskRoleId, setCurrentTaskRoleId] = useState<string | null>(null);

  // Model dropdown state for new chat
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  useEffect(() => {
    loadConfig();
    loadProviderCatalog();

    // Initialize theme
    const savedTheme = loadThemePreference();
    setThemePreference(savedTheme);
    applyTheme(savedTheme);
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
    if (themePreference) {
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
      applyTheme(validConfig.theme);
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

  const handleSessionDeleted = async (deletedSessionId: string) => {
    // 如果删除的是当前正在使用的 session
    if (currentSessionId === deletedSessionId) {
      // 先尝试取消正在进行的请求
      try {
        await invoke('cancel_message');
      } catch (error) {
        // 如果没有正在进行的请求，忽略错误
        console.log('No active request to cancel:', error);
      }

      // 清空对话界面
      setCurrentSessionId(null);
      setCurrentSessionTitle(null);
      setCurrentProviderName(null);
      setCurrentModelName(null);
      setMessages([]);
      setHasActiveSession(false);
      setIsDraftConversation(false);
    }

    // 刷新 session 列表
    setSessionListRefreshKey((prev) => prev + 1);
  };

  // Task 相关处理函数
  const handleNewTask = () => {
    if (!workingDirectory) return;
    setIsCreatingTask(true);
    setCurrentTask(null);
    setCurrentTaskRoleId(null);
  };

  const handleCancelTaskCreation = () => {
    setIsCreatingTask(false);
    setCurrentTask(null);
  };

  const handleTaskCreated = async (task: Task) => {
    try {
      // 保存 Task 到后端
      await invoke('save_task', { task });

      setCurrentTask(task);
      setIsCreatingTask(false);

      // 默认选中第一个角色
      if (task.roles.length > 0) {
        setCurrentTaskRoleId(task.roles[0].id);
        // 切换到第一个角色的 session
        const firstRole = task.roles[0];
        if (firstRole.sessionId) {
          handleSessionSelected(firstRole.sessionId);
        }
      }
    } catch (error) {
      console.error('Failed to save task:', error);
      alert(`Failed to save task: ${error}`);
    }
  };

  const handleTaskRoleSelected = async (roleId: string) => {
    if (!currentTask) return;

    const role = currentTask.roles.find((r) => r.id === roleId);
    if (!role) return;

    setCurrentTaskRoleId(roleId);

    // 切换到该角色的 session
    if (role.sessionId) {
      await handleSessionSelected(role.sessionId);
    }
  };

  const [showForwardModal, setShowForwardModal] = useState(false);

  const handleForwardLatestReply = () => {
    setShowForwardModal(true);
  };

  const handleForwardConfirm = async (targetRoleId: string, note: string) => {
    if (!currentTask) return;

    const targetRole = currentTask.roles.find((r) => r.id === targetRoleId);
    if (!targetRole || !targetRole.sessionId) {
      alert('Target role session not found');
      setShowForwardModal(false);
      return;
    }

    const currentRole = currentTask.roles.find((r) => r.id === currentTaskRoleId);
    const latestAssistantMessage = [...messages]
      .reverse()
      .find((m) => m.role === 'assistant');

    if (!latestAssistantMessage) {
      alert('No assistant message to forward');
      setShowForwardModal(false);
      return;
    }

    // 构造转发消息
    let forwardedContent = '';
    if (note.trim()) {
      forwardedContent += `[Note from user]\n${note.trim()}\n\n`;
    }
    forwardedContent += `[Forwarded Latest Reply from ${currentRole?.name}]\n${latestAssistantMessage.content}`;

    try {
      // 调用后端 API 转发消息
      await invoke('forward_message', {
        targetSessionId: targetRole.sessionId,
        messageContent: forwardedContent,
      });

      // 关闭弹层
      setShowForwardModal(false);

      // 显示成功提示
      alert(`Forwarded to ${targetRole.name}`);
    } catch (error) {
      console.error('Failed to forward message:', error);
      alert(`Failed to forward message: ${error}`);
    }
  };

  const handleExitTask = async () => {
    if (currentTask) {
      try {
        // 保存当前 Task 状态
        await invoke('save_task', { task: currentTask });
      } catch (error) {
        console.error('Failed to save task on exit:', error);
      }
    }

    setCurrentTask(null);
    setCurrentTaskRoleId(null);
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

  const handleNavigationModeChange = (mode: NavigationMode) => {
    setNavigationMode(mode);
    if (mode === 'task') {
      setIsCreatingTask(false);
    }
  };

  const handleNewChatClick = () => {
    setShowModelDropdown(true);
  };

  return (
    <div className="app">
      {isCreatingTask ? (
        <TaskBuilder
          workingDirectory={workingDirectory}
          availableProviders={availableProviders}
          onTaskCreated={handleTaskCreated}
          onCancel={handleCancelTaskCreation}
        />
      ) : (
        <>
          <MainNavigation
            currentMode={navigationMode}
            onModeChange={handleNavigationModeChange}
            onSettingsClick={() => setIsSettingsOpen(true)}
          />
          {navigationMode === 'normal' ? (
            <NormalModeLayout
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
              onSessionDeleted={handleSessionDeleted}
              onNewChatWithModel={handleNewChatWithModel}
              onNewTask={handleNewTask}
              hasActiveSession={hasActiveSession}
              isDraftConversation={isDraftConversation}
              onEnsureSession={ensureActiveSession}
              onNewChatClick={handleNewChatClick}
            />
          ) : (
            <TaskModeLayout
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
              onSessionDeleted={handleSessionDeleted}
              onNewChatWithModel={handleNewChatWithModel}
              onNewTask={handleNewTask}
              hasActiveSession={hasActiveSession}
              isDraftConversation={isDraftConversation}
              onEnsureSession={ensureActiveSession}
              currentTask={currentTask}
              currentTaskRoleId={currentTaskRoleId}
              onTaskRoleSelected={handleTaskRoleSelected}
              onForwardLatestReply={handleForwardLatestReply}
            />
          )}
        </>
      )}
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
          applyTheme(theme);
        }}
      />
      {showModelDropdown && (
        <ModelDropdown
          availableProviders={availableProviders}
          selectedValue={selectedProviderValue}
          onSelect={(value) => {
            handleNewChatWithModel(value);
            setShowModelDropdown(false);
          }}
          onClose={() => setShowModelDropdown(false)}
        />
      )}
      {showForwardModal && currentTask && currentTaskRoleId && (
        <ForwardLatestReplyModal
          task={currentTask}
          currentRoleId={currentTaskRoleId}
          messages={messages}
          onForward={handleForwardConfirm}
          onCancel={() => setShowForwardModal(false)}
        />
      )}
    </div>
  );
}

export default App;
