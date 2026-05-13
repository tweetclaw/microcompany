import React, { Suspense, lazy, useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import WelcomePage from './components/WelcomePage';
import MainNavigation, { NavigationMode } from './components/MainNavigation';
import { TitleBar } from './components/TitleBar';
import Toolbar from './components/Toolbar';
import { AiRequestEndEvent, HandoffSuggestion, Message, Task, TaskCreateRequest, TaskSummary, TaskRole, TeamBrief, AiRunState } from './types';
import { ProviderConfig, ProviderInfo, SettingsData, ensureValidActiveProvider, isProviderUsable, normalizeProviderInfo, normalizeSettingsData, toBackendSettingsData } from './types/settings';
import { getSession, createTask, getTask, getTeamBrief, restartTaskRoleSession } from './api';
import { bindWindowStatePersistence } from './utils/windowState';
import { ThemePreference, applyTheme, loadThemePreference, saveThemePreference } from './utils/themeState';
import './App.css';

const NormalModeLayout = lazy(() => import('./components/NormalModeLayout'));
const TaskModeLayout = lazy(() => import('./components/TaskModeLayout'));
const TaskBuilder = lazy(() => import('./components/TaskBuilder'));
const ForwardLatestReplyModal = lazy(() => import('./components/ForwardLatestReplyModal'));
const SearchModal = lazy(() => import('./components/SearchModal'));
const Settings = lazy(() => import('./components/Settings').then((module) => ({ default: module.Settings })));
const TemplateManagerPanel = lazy(() => import('./components/TemplateManagerPanel'));

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

async function loadTaskContext(taskId: string) {
  const [task, teamBrief] = await Promise.all([
    getTask(taskId),
    getTeamBrief(taskId),
  ]);

  return { task, teamBrief };
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
  const [currentTeamBrief, setCurrentTeamBrief] = useState<TeamBrief | null>(null);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [currentTaskRoleId, setCurrentTaskRoleId] = useState<string | null>(null);
  const [taskListRefreshKey, setTaskListRefreshKey] = useState(0);

  // AI run state — kept at App level so it survives ChatInterface unmount/remount
  const [runState, setRunState] = useState<AiRunState>('idle');
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);

  // Fallback listener: if ChatInterface is unmounted when ai-request-end fires
  // (e.g. user switched views mid-request), App.tsx resets global runState so
  // the user isn't stuck in a perpetual "busy" state on return.
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen<AiRequestEndEvent>('ai-request-end', (event) => {
      const { request_id, result, outcome } = event.payload;
      setActiveRequestId((prev) => {
        if (prev !== request_id) return prev; // not our request, ignore
        console.log('[App] ai-request-end fallback: resetting global runState', {
          request_id,
          result,
          outcome,
          prev,
        });
        return null;
      });
      setRunState((prev) => {
        // Only reset if we're still in a running state for this request.
        // ChatInterface will have already called onRunStateChange if it was mounted,
        // so this is purely a safety net for the unmounted case.
        const RUNNING: AiRunState[] = ['running_thinking', 'running_tool', 'running_generating', 'finalizing'];
        if (!RUNNING.includes(prev)) return prev;
        console.log('[App] ai-request-end fallback: runState', prev, '→ idle');
        return 'idle';
      });
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []);

  // Layout panel visibility state
  const [isSessionListCollapsed, setIsSessionListCollapsed] = useState(false);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(false);
  const [isTerminalCollapsed, setIsTerminalCollapsed] = useState(false);

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
    const logViewportMetrics = (reason: string) => {
      const root = document.getElementById('root');
      const app = document.querySelector('.app') as HTMLElement | null;
      const welcome = document.querySelector('.welcome-page') as HTMLElement | null;
      const metrics = {
        reason,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        outerWidth: window.outerWidth,
        outerHeight: window.outerHeight,
        devicePixelRatio: window.devicePixelRatio,
        rootClientWidth: root?.clientWidth,
        rootClientHeight: root?.clientHeight,
        appClientWidth: app?.clientWidth,
        appClientHeight: app?.clientHeight,
        welcomeClientWidth: welcome?.clientWidth,
        welcomeClientHeight: welcome?.clientHeight,
      };
      console.log('[Layout Debug] viewport metrics:', metrics);
    };

    logViewportMetrics('mount');
    const handleResize = () => logViewportMetrics('resize');
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
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
    const initialize = async () => {
      await initializeDb();
      loadConfig();
      loadProviderCatalog();
    };

    initialize();

    const savedTheme = loadThemePreference();
    setThemePreference(savedTheme);
    applyTheme(savedTheme);
  }, []);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const setupWindowState = async () => {
      console.log('[WindowState] Skipping restoreWindowState on startup to avoid conflict with Rust window setup');
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

  // Listen for backend session-title-updated event and refresh UI immediately
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen<{ session_id: string; title: string }>('session-title-updated', (event) => {
      const { session_id, title } = event.payload;
      // Update header title if this is the current session
      setCurrentSessionTitle((prev) => {
        if (prev !== null) return title; // only update if we have an active session
        return prev;
      });
      // Trigger session list refresh so the sidebar shows the new title
      setSessionListRefreshKey((prev) => prev + 1);
      console.log('[App] session-title-updated', { session_id, title });
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, []);

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

    // Resize window to main view size (90% screen) when entering main interface
    try {
      await invoke('resize_window_for_main_view');
      console.log('[App] Window resized to main view size');
    } catch (error) {
      console.error('[App] Failed to resize window:', error);
    }
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
      const messages = await invoke<Array<{
        id: string;
        role: string;
        content: string;
        created_at: string;
        timeline?: Array<{
          id: string;
          messageId: string;
          type: 'thinking' | 'tool_call' | 'output';
          timestamp: number;
          content?: string;
          tool?: string;
          action?: string;
          status?: 'running' | 'success' | 'error';
          result?: string;
        }>;
        tool_calls?: Array<{
          id: string;
          tool: string;
          action: string;
          status: 'running' | 'success' | 'error';
          result?: string;
          timestamp: number;
        }>;
      }>>('get_messages', {
        sessionId,
      });

      // DEBUG: Log raw messages from backend
      console.log('[App.tsx] Raw messages from get_messages:', JSON.stringify(messages, null, 2));
      console.log('[App.tsx] Timeline counts:', messages.map(m => ({ id: m.id, role: m.role, timeline_count: m.timeline?.length || 0 })));

      const loadedMessages: Message[] = messages.map((msg) => ({
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        timestamp: new Date(msg.created_at).getTime(),
        timeline: msg.timeline,
        toolCalls: msg.tool_calls,
      }));

      setCurrentSessionId(sessionId);
      setCurrentSessionTitle(session.name);
      
      // Debug: Log session provider and model
      console.log('[App.tsx] handleSessionSelected: session.provider =', session.provider);
      console.log('[App.tsx] handleSessionSelected: session.model =', session.model);
      console.log('[App.tsx] handleSessionSelected: availableProviders =', availableProviders.map(p => ({ id: p.id, name: p.name, model: p.model })));
      
      // Find provider by ID to get the friendly name
      const provider = availableProviders.find((p) => p.id === session.provider || `${p.id}::${p.model}` === `${session.provider}::${session.model}`);
      console.log('[App.tsx] handleSessionSelected: found provider =', provider ? { id: provider.id, name: provider.name, model: provider.model } : null);
      
      setCurrentProviderName(provider?.name || session.provider);
      setCurrentModelName(provider?.model || session.model);
      console.log('[App.tsx] handleSessionSelected: displaying providerName =', provider?.name || session.provider);
      console.log('[App.tsx] handleSessionSelected: displaying modelName =', provider?.model || session.model);
      
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
    setCurrentTeamBrief(null);
    setCurrentTaskRoleId(null);
  };

  const handleCancelTaskCreation = () => {
    setIsCreatingTask(false);
    setCurrentTask(null);
    setCurrentTeamBrief(null);
  };

  const handleTaskCreated = async (taskRequest: TaskCreateRequest) => {
    try {
      const createdTask = await createTask(taskRequest);
      const teamBrief = await getTeamBrief(createdTask.id);

      setCurrentTask(createdTask);
      setCurrentTeamBrief(teamBrief);
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

  const handleTaskRoleRestart = async (roleId: string) => {
    if (!currentTask || runState !== 'idle') return;

    try {
      const updatedTask = await restartTaskRoleSession(currentTask.id, roleId);
      setCurrentTask(updatedTask);
      setCurrentTaskRoleId(roleId);
      setSessionListRefreshKey((prev) => prev + 1);

      const updatedRole = updatedTask.roles.find((role) => role.id === roleId);
      if (updatedRole?.session_id) {
        await handleSessionSelected(updatedRole.session_id);
      }
    } catch (error) {
      console.error('Failed to restart task role session:', error);
      alert(`Failed to restart task role session: ${error}`);
    }
  };

  const handleTaskSelected = async (taskSummary: TaskSummary) => {
    try {
      const { task, teamBrief } = await loadTaskContext(taskSummary.id);
      setCurrentTask(task);
      setCurrentTeamBrief(teamBrief);
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
  const [pendingHandoffSuggestion, setPendingHandoffSuggestion] = useState<HandoffSuggestion | null>(null);

  const handleForwardLatestReply = () => {
    setPendingHandoffSuggestion(null);
    setShowForwardModal(true);
  };

  const handleHandoffSuggestion = (event: AiRequestEndEvent) => {
    if (!event.handoffSuggestion?.recommended) return;

    // Allow handoff even if targetRoleId is missing - user can manually select the target role
    if (!event.handoffSuggestion.targetRoleId) {
      console.info(
        'Handoff suggestion without targetRoleId - AI suggested a role name that does not match roster. User will manually select target.',
        event.handoffSuggestion
      );
    }

    setPendingHandoffSuggestion(event.handoffSuggestion);
    setShowForwardModal(true);
  };

  const handleManualHandoffFromMessage = (
    _message: Message,
    handoffRawValue: string,
    cleanedContent: string
  ) => {
    if (!currentTask) {
      console.warn('[Manual Handoff] No current task');
      return;
    }

    console.log('[Manual Handoff] Starting role resolution', {
      handoffRawValue,
      availableRoles: currentTask.roles.map(r => ({ id: r.id, name: r.name, identity: r.identity }))
    });

    const normalizedHandoffValue = handoffRawValue.toLowerCase().trim();
    const shorthandMatch = normalizedHandoffValue.match(/^(?:role_)?([a-z])$/i);

    const matchedRole = currentTask.roles.find(
      (r) =>
        r.name.toLowerCase().trim() === normalizedHandoffValue ||
        r.identity.toLowerCase().trim() === normalizedHandoffValue ||
        r.id.toLowerCase().trim() === normalizedHandoffValue
    ) ?? (shorthandMatch
      ? currentTask.roles[shorthandMatch[1].charCodeAt(0) - 'a'.charCodeAt(0)]
      : undefined);

    const targetRoleId = matchedRole?.id;
    const targetRoleName = matchedRole?.name ?? handoffRawValue;

    if (matchedRole) {
      console.log('[Manual Handoff] Matched role', {
        targetRoleId,
        targetRoleName,
        matchSource: shorthandMatch ? 'shorthand_or_direct' : 'direct'
      });
    } else {
      console.warn('[Manual Handoff] No role matched', { handoffRawValue });
    }

    // 构造 HandoffSuggestion
    const suggestion: HandoffSuggestion = {
      recommended: true,
      targetRoleId: targetRoleId,
      targetRoleName: targetRoleName,
      reason: '基于历史消息中的 handoff 标签重新发起调度',
      draftMessage: '',
      fullMessage: cleanedContent,
    };

    console.log('[Manual Handoff] Opening modal with suggestion', {
      handoffRawValue,
      targetRoleId,
      targetRoleName,
      cleanedContentLength: cleanedContent.length,
      suggestion,
    });

    setPendingHandoffSuggestion(suggestion);
    setShowForwardModal(true);
  };

  const handleForwardConfirm = async (targetRoleId: string, forwardedContent: string) => {
    if (!currentTask) return;

    const targetRole = currentTask.roles.find((r) => r.id === targetRoleId);
    if (!targetRole || !targetRole.session_id) {
      console.error('[Forward] Target role session not found', {
        targetRoleId,
        currentTaskRoleId,
        roleCount: currentTask.roles.length,
      });
      alert('Target role session not found');
      setShowForwardModal(false);
      return;
    }

    if (!forwardedContent.trim()) {
      console.warn('[Forward] Refusing to forward empty content', {
        targetRoleId,
        currentTaskRoleId,
      });
      alert('没有可转发的内容');
      return;
    }

    const forwardingFromRole = currentTask.roles.find((r) => r.id === currentTaskRoleId) ?? null;
    const forwardedUserMessage: Message = {
      id: `forward-${Date.now()}`,
      role: 'user',
      content: forwardedContent,
      timestamp: Date.now(),
    };

    console.log('[Forward] Starting handoff forwarding', {
      fromRoleId: currentTaskRoleId,
      fromRoleName: forwardingFromRole?.name,
      targetRoleId,
      targetRoleName: targetRole.name,
      targetSessionId: targetRole.session_id,
      contentLength: forwardedContent.length,
      preview: forwardedContent.slice(0, 200),
    });

    setShowForwardModal(false);
    setPendingHandoffSuggestion(null);

    let appendedForwardMessage = false;

    try {
      if (targetRoleId !== currentTaskRoleId) {
        console.log('[Forward] Switching active role before send', {
          fromRoleId: currentTaskRoleId,
          toRoleId: targetRoleId,
          toSessionId: targetRole.session_id,
        });
        await handleTaskRoleSelected(targetRoleId);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      console.log('[Forward] Active role switch completed', {
        expectedRoleId: targetRoleId,
        expectedSessionId: targetRole.session_id,
      });

      appendedForwardMessage = true;
      setMessages((prev) => {
        console.log('[Forward] Appending forwarded message to UI state', {
          previousCount: prev.length,
          nextCount: prev.length + 1,
          targetRoleId,
        });
        return [...prev, forwardedUserMessage];
      });

      console.log('[Forward] Invoking send_message for target role', {
        targetRoleId,
        targetSessionId: targetRole.session_id,
        contentLength: forwardedContent.length,
      });
      const sendResult = await invoke<string>('send_message', { message: forwardedContent });
      console.log('[Forward] send_message completed', {
        targetRoleId,
        targetSessionId: targetRole.session_id,
        responseLength: sendResult?.length ?? 0,
      });
    } catch (error) {
      const errorMessage = String(error);
      const wasCancelled = /cancelled/i.test(errorMessage);

      console.error('[Forward] Failed to forward message', {
        targetRoleId,
        targetSessionId: targetRole.session_id,
        error,
        wasCancelled,
      });

      if (appendedForwardMessage && wasCancelled) {
        setMessages((prev) => prev.filter((message) => message.id !== forwardedUserMessage.id));
      }

      if (wasCancelled) {
        console.info('[Forward] Forwarding request was cancelled by user', {
          targetRoleId,
          targetSessionId: targetRole.session_id,
        });
        return;
      }

      alert(`Failed to forward message: ${error}`);
    }
  };


  const handleExitTask = async () => {
    // 任务状态已由后端自动持久化，无需手动保存
    setCurrentTask(null);
    setCurrentTeamBrief(null);
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
      setCurrentTeamBrief(null);
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
            status: 'ready',
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
                runState={runState}
                onRunStateChange={setRunState}
                activeRequestId={activeRequestId}
                onActiveRequestIdChange={setActiveRequestId}
              />
            </Suspense>
          ) : navigationMode === 'task' ? (
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
                currentTeamBrief={currentTeamBrief}
                currentTaskRoleId={currentTaskRoleId}
                onTaskRoleSelected={handleTaskRoleSelected}
                onTaskRoleRestart={handleTaskRoleRestart}
                onForwardLatestReply={handleForwardLatestReply}
                onHandoffSuggestion={handleHandoffSuggestion}
                onHandoffClick={handleManualHandoffFromMessage}
                onTaskSelected={handleTaskSelected}
                onTaskDeleted={handleTaskDeleted}
                taskListRefreshKey={taskListRefreshKey}
                onSettingsClick={() => setIsSettingsOpen(true)}
                isSessionListCollapsed={isSessionListCollapsed}
                isInspectorCollapsed={isInspectorCollapsed}
                isTerminalCollapsed={isTerminalCollapsed}
                runState={runState}
                onRunStateChange={setRunState}
                activeRequestId={activeRequestId}
                onActiveRequestIdChange={setActiveRequestId}
              />
            </Suspense>
          ) : (
            <Suspense fallback={null}>
              <TemplateManagerPanel onBack={() => setNavigationMode('task')} />
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
            suggestion={pendingHandoffSuggestion}
            onForward={handleForwardConfirm}
            onCancel={() => {
              setShowForwardModal(false);
              setPendingHandoffSuggestion(null);
            }}
          />
        )}
      </Suspense>
    </div>
  );
}

export default App;
