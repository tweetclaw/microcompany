import React, { Suspense, lazy, useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import WelcomePage from './components/WelcomePage';
import MainNavigation, { NavigationMode } from './components/MainNavigation';
import { TitleBar } from './components/TitleBar';
import Toolbar from './components/Toolbar';
import { Message, Task, TaskCreateRequest, TaskSummary, TaskRole, AiRunState } from './types';
import { ProviderConfig, ProviderInfo, SettingsData, ensureValidActiveProvider, isProviderUsable, normalizeProviderInfo, normalizeSettingsData, toBackendSettingsData } from './types/settings';
import { getSession, createTask } from './api';
import { bindWindowStatePersistence, restoreWindowState } from './utils/windowState';
import { ThemePreference, applyTheme, loadThemePreference, saveThemePreference } from './utils/themeState';
import './App.css';

const NormalModeLayout = lazy(() => import('./components/NormalModeLayout'));
const TaskModeLayout = lazy(() => import('./components/TaskModeLayout'));
const TaskBuilder = lazy(() => import('./components/TaskBuilder'));
const ForwardLatestReplyModal = lazy(() => import('./components/ForwardLatestReplyModal'));
const SearchModal = lazy(() => import('./components/SearchModal'));
const Settings = lazy(() => import('./components/Settings').then((module) => ({ default: module.Settings })));

const PRODUCT_MANAGER_IDENTITIES = new Set(['product manager', 'pm', '项目经理', '产品经理']);

function isProductManagerRole(role: TaskRole) {
  const normalizedIdentity = role.identity.trim().toLowerCase();
  return role.archetype_id === 'product_manager' || PRODUCT_MANAGER_IDENTITIES.has(normalizedIdentity);
}

function getInitialTaskRole(task: Task) {
  if (task.pm_first_workflow) {
    return task.roles.find(isProductManagerRole) ?? task.roles[0] ?? null;
  }

  return task.roles[0] ?? null;
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
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>('dark');

  // 草稿对话状态：用于"新建"时不立即创建后端 session
  const [isDraftConversation, setIsDraftConversation] = useState(false);

  // Navigation mode
  const [navigationMode, setNavigationMode] = useState<NavigationMode>('normal');

  // Task 状态
  const [currentTask, setCurrentTask] = useState<Task | null>(null);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [currentTaskRoleId, setCurrentTaskRoleId] = useState<string | null>(null);
  const [taskListRefreshKey, setTaskListRefreshKey] = useState(0);

  // AI run state
  const [runState, setRunState] = useState<AiRunState>('idle');

  // Layout panel visibility state
  const [isSessionListCollapsed, setIsSessionListCollapsed] = useState(false);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);
  const [isTerminalCollapsed, setIsTerminalCollapsed] = useState(false);

  useEffect(() => {
    console.log('[App] Setting up event listeners for ai-status and ai-request-end');

    const unlistenStatus = listen<{ phase: string }>('ai-status', (event) => {
      const phase = event.payload.phase;
      console.log('[App] AI status changed, phase:', phase);

      // Map phase to AiRunState
      let state: AiRunState = 'idle';
      if (phase === 'thinking') {
        state = 'running_thinking';
      } else if (phase === 'tool_running') {
        state = 'running_tool';
      } else if (phase === 'generating') {
        state = 'running_generating';
      } else if (phase === 'finalizing') {
        state = 'finalizing';
      }

      console.log('[App] Mapped to runState:', state);
      setRunState(state);
    });

    const unlistenRequestEnd = listen<{ result: string; error_message?: string }>('ai-request-end', (event) => {
      console.log('[App] AI request ended, result:', event.payload.result, 'error:', event.payload.error_message);
      setRunState('idle');
    });

    return () => {
      console.log('[App] Cleaning up event listeners');
      unlistenStatus.then((fn) => fn());
      unlistenRequestEnd.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const initialize = async () => {
      await initializeDb();
      loadConfig();
      loadProviderCatalog();
    };

    initialize();

    // Initialize theme
    const savedTheme = loadThemePreference();
    setThemePreference(savedTheme);
    applyTheme(savedTheme);
  }, []);

  const initializeDb = async () => {
    console.log('[App] Starting database initialization...');
    try {
      await invoke('initialize_database');
      console.log('[App] Database initialized successfully');
    } catch (error) {
      console.error('[App] Failed to initialize database:', error);
      alert(`Database initialization failed: ${error}`);
    }
  };

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
      const session = await getSession(sessionId);

      // 任务会话需要特殊初始化：直接创建 Claurst 会话
      if (session.type === 'task') {
        await invoke<string>('init_task_session', {
          sessionId,
          model: session.model,
          provider: session.provider,
        });
      } else {
        // 普通会话使用原有流程
        await invoke<string>('init_session', {
          workingDir: workingDirectory,
          sessionId,
          providerId: null,
        });
      }

      // 从数据库加载消息（任务会话和普通会话都支持）
      const messages = await invoke<Array<{ id: string; role: string; content: string; created_at: string }>>('get_messages', {
        sessionId,
      });

      const loadedMessages: Message[] = messages.map((msg) => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        timestamp: new Date(msg.created_at).getTime(),
      }));

      setCurrentSessionId(sessionId);
      setCurrentSessionTitle(session.name);
      setCurrentProviderName(session.provider);
      setCurrentModelName(session.model);
      setSelectedProviderValue(`${session.provider}::${session.model}`);
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

  const handleMessageCompleted = () => {
    // 刷新会话列表以更新标题
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

  const handleTaskCreated = async (taskRequest: TaskCreateRequest) => {
    try {
      const createdTask = await createTask(taskRequest);

      setCurrentTask(createdTask);
      setIsCreatingTask(false);

      const initialRole = getInitialTaskRole(createdTask);
      if (initialRole) {
        setCurrentTaskRoleId(initialRole.id);
        if (initialRole.session_id) {
          handleSessionSelected(initialRole.session_id);
        }
      }
    } catch (error) {
      console.error('Failed to create task:', error);
      alert(`Failed to create task: ${error}`);
    }
  };

  const handleTaskRoleSelected = async (roleId: string) => {
    if (!currentTask) return;

    // AI 工作时禁止切换角色，防止并发
    if (runState !== 'idle' && roleId !== currentTaskRoleId) {
      return;
    }

    const role = currentTask.roles.find((r) => r.id === roleId);
    if (!role) return;

    setCurrentTaskRoleId(roleId);

    // 切换到该角色的 session
    if (role.session_id) {
      await handleSessionSelected(role.session_id);
    }
  };

  const handleTaskSelected = async (taskSummary: TaskSummary) => {
    try {
      const task = await invoke<Task>('get_task', { taskId: taskSummary.id });
      setCurrentTask(task);
      setNavigationMode('task');
      setTaskListRefreshKey((prev) => prev + 1);

      const initialRole = getInitialTaskRole(task);
      if (initialRole) {
        setCurrentTaskRoleId(initialRole.id);
        if (initialRole.session_id) {
          await handleSessionSelected(initialRole.session_id);
        }
      }
    } catch (error) {
      console.error('Failed to handle task selection:', error);
      alert(`Failed to handle task selection: ${error}`);
    }
  };

  const [showForwardModal, setShowForwardModal] = useState(false);

  const handleForwardLatestReply = () => {
    setShowForwardModal(true);
  };

  const handleForwardConfirm = async (targetRoleId: string, note: string) => {
    if (!currentTask) return;

    const targetRole = currentTask.roles.find((r) => r.id === targetRoleId);
    if (!targetRole || !targetRole.session_id) {
      alert('Target role session not found');
      setShowForwardModal(false);
      return;
    }

    const currentRole = currentTask.roles.find((r) => r.id === currentTaskRoleId);

    const latestAssistantMessage = [...messages]
      .reverse()
      .find((m) => m.role === 'assistant');

    if (!latestAssistantMessage) {
      alert('当前会话中没有AI回复可以转发');
      setShowForwardModal(false);
      return;
    }

    let forwardedContent = '';
    if (note.trim()) {
      forwardedContent += `[Note from user]\n${note.trim()}\n\n`;
    }
    forwardedContent += `[Forwarded Latest Reply from ${currentRole?.name}]\n${latestAssistantMessage.content}`;

    setShowForwardModal(false);

    try {
      if (targetRoleId !== currentTaskRoleId) {
        await handleTaskRoleSelected(targetRoleId);
        // 等待角色切换和消息加载完成
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // 先添加用户消息到前端显示
      const forwardedUserMessage: Message = {
        id: `forward-${Date.now()}`,
        role: 'user',
        content: forwardedContent,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, forwardedUserMessage]);

      // 触发AI响应,send_message会自动添加用户消息到数据库并触发AI处理
      await invoke('send_message', { message: forwardedContent });
    } catch (error) {
      console.error('Failed to forward message:', error);
      alert(`Failed to forward message: ${error}`);
    }
  };

  const handleExitTask = async () => {
    // 任务状态已由后端自动持久化，无需手动保存
    setCurrentTask(null);
    setCurrentTaskRoleId(null);
  };

  const handleTaskDeleted = async (deletedTaskId: string) => {
    // 如果删除的是当前正在查看的 task
    if (currentTask && currentTask.id === deletedTaskId) {
      // 先尝试取消正在进行的请求
      try {
        await invoke('cancel_message');
      } catch (error) {
        console.log('No active request to cancel:', error);
      }

      // 清空 task 相关状态
      setCurrentTask(null);
      setCurrentTaskRoleId(null);
      setCurrentSessionId(null);
      setCurrentSessionTitle(null);
      setCurrentProviderName(null);
      setCurrentModelName(null);
      setMessages([]);
      setHasActiveSession(false);
      setIsDraftConversation(false);
    }

    // 刷新 task 列表
    setTaskListRefreshKey((prev) => prev + 1);
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

  const handleSearchResultClick = async (sessionId: string, sessionType: string, taskId: string | null) => {
    if (sessionType === 'task' && taskId) {
      try {
        const session = await getSession(sessionId);
        if (session.task_id) {
          // Create a minimal TaskSummary to pass to handleTaskSelected
          const taskSummary: TaskSummary = {
            id: session.task_id,
            name: '',
            description: '',
            icon: '',
            pm_first_workflow: false,
            role_count: 0,
            total_messages: 0,
            created_at: '',
            updated_at: '',
          };
          await handleTaskSelected(taskSummary);
        }
      } catch (error) {
        console.error('Failed to load task from search:', error);
      }
    } else {
      await handleSessionSelected(sessionId);
      setNavigationMode('normal');
    }
  };


  const handleToggleSessionList = () => {
    setIsSessionListCollapsed(!isSessionListCollapsed);
  };

  const handleToggleInspector = () => {
    setIsInspectorCollapsed(!isInspectorCollapsed);
  };

  const handleToggleTerminal = () => {
    setIsTerminalCollapsed(!isTerminalCollapsed);
  };

  return (
    <div className="app">
      {!isCreatingTask && (
        <div className="app-header">
          <TitleBar
            onToggleSessionList={handleToggleSessionList}
            onToggleInspector={handleToggleInspector}
            onToggleTerminal={handleToggleTerminal}
            isSessionListCollapsed={isSessionListCollapsed}
            isInspectorCollapsed={isInspectorCollapsed}
            isTerminalCollapsed={isTerminalCollapsed}
          />
        </div>
      )}
      {isCreatingTask ? (
        <Suspense fallback={null}>
          <TaskBuilder
            workingDirectory={workingDirectory}
            availableProviders={availableProviders}
            onTaskCreated={handleTaskCreated}
            onCancel={handleCancelTaskCreation}
          />
        </Suspense>
      ) : (
        <div className="app-body">
          <MainNavigation
            currentMode={navigationMode}
            onModeChange={handleNavigationModeChange}
            onSettingsClick={() => setIsSettingsOpen(true)}
            onSearchClick={() => setIsSearchOpen(true)}
          />
          {navigationMode === 'normal' ? (
            <Suspense fallback={null}>
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
                onSettingsClick={() => setIsSettingsOpen(true)}
                isSessionListCollapsed={isSessionListCollapsed}
                isInspectorCollapsed={isInspectorCollapsed}
                isTerminalCollapsed={isTerminalCollapsed}
              />
            </Suspense>
          ) : (
            <Suspense fallback={null}>
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
                onTaskSelected={handleTaskSelected}
                onTaskDeleted={handleTaskDeleted}
                taskListRefreshKey={taskListRefreshKey}
                onSettingsClick={() => setIsSettingsOpen(true)}
                isSessionListCollapsed={isSessionListCollapsed}
                isInspectorCollapsed={isInspectorCollapsed}
                isTerminalCollapsed={isTerminalCollapsed}
                runState={runState}
              />
            </Suspense>
          )}
        </div>
      )}
      <Suspense fallback={null}>
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
        <SearchModal
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          onResultClick={handleSearchResultClick}
        />
        {showForwardModal && currentTask && currentTaskRoleId && (
          <ForwardLatestReplyModal
            task={currentTask}
            currentRoleId={currentTaskRoleId}
            messages={messages}
            onForward={handleForwardConfirm}
            onCancel={() => setShowForwardModal(false)}
          />
        )}
      </Suspense>
    </div>
  );
}

export default App;
