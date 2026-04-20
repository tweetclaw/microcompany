import { useEffect, useMemo, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { TitleBar } from './TitleBar';
import Toolbar from './Toolbar';
import MessageList from './MessageList';
import InputBox from './InputBox';
import Sidebar from './Sidebar';
import InspectorPanel from './InspectorPanel';
import TerminalPanel from './TerminalPanel';
import { ToolIndicator } from './ToolIndicator';
import {
  AiMessageChunkEvent,
  AiRequestEndEvent,
  AiRequestStartEvent,
  AiRunState,
  AiStatusEvent,
  AiToolEndEvent,
  AiToolStartEvent,
  Message,
  ProcessTimelineItem,
  ToolCall,
} from '../types';
import { ProviderConfig } from '../types/settings';
import { loadLayoutState, saveLayoutState } from '../utils/layoutState';
import './ChatInterface.css';

interface ChatInterfaceProps {
  workingDirectory: string | null;
  currentSessionId: string | null;
  currentSessionTitle: string | null;
  currentProviderName: string | null;
  currentModelName: string | null;
  availableProviders: ProviderConfig[];
  selectedProviderValue: string;
  messages: Message[];
  onMessagesChange: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  sessionListRefreshKey?: string | number;
  onSessionSelected: (sessionId: string) => void;
  onSessionDeleted?: (sessionId: string) => void;
  onNewChatWithModel: (modelValue: string) => void;
  onNewTask: () => void;
  hasActiveSession: boolean;
  isDraftConversation: boolean;
  onEnsureSession: () => Promise<string | null>;
  onSettingsClick: () => void;
  onCancelRequest?: () => Promise<void>;
  hideSidebar?: boolean;
  hideInspector?: boolean;
  hideNewButtons?: boolean;
  hideToolbar?: boolean;
  hideTitleBar?: boolean;
  externalInspectorCollapsed?: boolean;
  externalTerminalCollapsed?: boolean;
}

const RUNNING_STATES: AiRunState[] = [
  'running_thinking',
  'running_tool',
  'running_generating',
  'finalizing',
];

function ChatInterface({
  workingDirectory,
  currentSessionId,
  currentSessionTitle,
  currentProviderName,
  currentModelName,
  availableProviders,
  selectedProviderValue,
  messages,
  onMessagesChange,
  sessionListRefreshKey,
  onSessionSelected,
  onSessionDeleted,
  onNewChatWithModel,
  onNewTask,
  hasActiveSession,
  isDraftConversation,
  onEnsureSession,
  onSettingsClick,
  hideSidebar = false,
  hideInspector = false,
  hideNewButtons = false,
  hideToolbar = false,
  hideTitleBar = false,
  externalInspectorCollapsed,
  externalTerminalCollapsed,
}: ChatInterfaceProps) {
  const [currentToolCall, setCurrentToolCall] = useState<ToolCall | null>(null);
  const [runState, setRunState] = useState<AiRunState>('idle');
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [processTimeline, setProcessTimeline] = useState<ProcessTimelineItem[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);

  const initialLayout = useMemo(() => loadLayoutState(), []);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(initialLayout.isSidebarCollapsed);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(initialLayout.isInspectorCollapsed);
  const [isTerminalCollapsed, setIsTerminalCollapsed] = useState(initialLayout.isTerminalCollapsed);

  const effectiveInspectorCollapsed = externalInspectorCollapsed !== undefined ? externalInspectorCollapsed : isInspectorCollapsed;
  const effectiveTerminalCollapsed = externalTerminalCollapsed !== undefined ? externalTerminalCollapsed : isTerminalCollapsed;
  const [isSidebarDrawerOpen, setIsSidebarDrawerOpen] = useState(false);
  const [isInspectorDrawerOpen, setIsInspectorDrawerOpen] = useState(false);
  const [isCompact, setIsCompact] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < 1280 : false));

  const onMessagesChangeRef = useRef(onMessagesChange);
  const activeRequestIdRef = useRef<string | null>(activeRequestId);

  useEffect(() => {
    onMessagesChangeRef.current = onMessagesChange;
  }, [onMessagesChange]);

  useEffect(() => {
    activeRequestIdRef.current = activeRequestId;
  }, [activeRequestId]);

  useEffect(() => {
    // 如果当前正在运行中（有活跃的请求），不要重置状态
    // 这样可以避免在草稿转换为真实 session 时中断流式显示
    // 注意：必须检查 ref 而不是状态，因为状态更新是异步的
    if (runState !== 'idle' && activeRequestIdRef.current) {
      return;
    }
    resetConversationRunState();
  }, [currentSessionId]);

  const isBusy = RUNNING_STATES.includes(runState);
  const canCancel = isBusy && Boolean(activeRequestId);
  const isCancelling = runState === 'finalizing';
  const isInputDisabled = !workingDirectory;

  const appendTimeline = (item: ProcessTimelineItem) => {
    setProcessTimeline((prev) => [...prev, item]);
  };

  const finalizeStreamingMessage = (requestId?: string | null, finalText?: string) => {
    onMessagesChangeRef.current((prev: Message[]) => {
      const targetIndex = [...prev]
        .map((message, index) => ({ message, index }))
        .reverse()
        .find(({ message }) => message.role === 'assistant' && (!requestId || message.requestId === requestId))?.index;

      if (targetIndex === undefined) {
        if (finalText && finalText.trim()) {
          return [
            ...prev,
            {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              role: 'assistant',
              content: finalText.trim(),
              timestamp: Date.now(),
              isStreaming: false,
              requestId: requestId || undefined,
            },
          ];
        }
        return prev;
      }

      const targetMessage = prev[targetIndex];

      // 关键修改：不替换内容，只标记为非流式状态
      // 前端通过 message-chunk 事件已经累积了完整的文本
      // 后端的 final_text 可能是不完整的（特别是在使用工具调用时）
      return [
        ...prev.slice(0, targetIndex),
        { ...targetMessage, isStreaming: false },
        ...prev.slice(targetIndex + 1),
      ];
    });
  };

  const resetRunIfTerminal = (delayMs = 0) => {
    const applyReset = () => {
      setCurrentToolCall(null);
      activeRequestIdRef.current = null;
      setActiveRequestId(null);
      setRunState('idle');
    };

    if (delayMs > 0) {
      window.setTimeout(applyReset, delayMs);
      return;
    }

    applyReset();
  };

  const resetConversationRunState = () => {
    setRunState('idle');
    setLastError(null);
    setCurrentToolCall(null);
    setProcessTimeline([]);
    activeRequestIdRef.current = null;
    setActiveRequestId(null);
  };

  useEffect(() => {
    saveLayoutState({
      isSidebarCollapsed,
      isInspectorCollapsed,
      isTerminalCollapsed,
    });
  }, [isSidebarCollapsed, isInspectorCollapsed, isTerminalCollapsed]);

  useEffect(() => {
    const handleResize = () => {
      const compact = window.innerWidth < 1280;
      setIsCompact(compact);
      if (!compact) {
        setIsSidebarDrawerOpen(false);
        setIsInspectorDrawerOpen(false);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    let unlistenChunk: (() => void) | null = null;
    let unlistenToolStart: (() => void) | null = null;
    let unlistenToolEnd: (() => void) | null = null;
    let unlistenRequestStart: (() => void) | null = null;
    let unlistenStatus: (() => void) | null = null;
    let unlistenRequestEnd: (() => void) | null = null;

    const setupListeners = async () => {
      unlistenRequestStart = await listen<AiRequestStartEvent>('ai-request-start', (event) => {
        const payload = event.payload;
        setActiveRequestId(payload.request_id);
        activeRequestIdRef.current = payload.request_id;
        setRunState('running_thinking');
        setLastError(null);
        setCurrentToolCall(null);
        setProcessTimeline([]);
        appendTimeline({
          id: `${payload.request_id}-${payload.timestamp}-start`,
          requestId: payload.request_id,
          kind: 'request_start',
          text: '请求开始',
          timestamp: payload.timestamp,
        });
      });

      unlistenStatus = await listen<AiStatusEvent>('ai-status', (event) => {
        const payload = event.payload;
        if (payload.request_id !== activeRequestIdRef.current) return;

        if (payload.phase === 'thinking') {
          setRunState((prev) => (prev === 'finalizing' ? prev : 'running_thinking'));
        } else if (payload.phase === 'tool_running') {
          setRunState('running_tool');
        } else if (payload.phase === 'generating') {
          setRunState((prev) => (prev === 'finalizing' ? prev : 'running_generating'));
        } else if (payload.phase === 'finalizing') {
          setRunState('finalizing');
        }

        appendTimeline({
          id: `${payload.request_id}-${payload.timestamp}-status-${Math.random().toString(36).slice(2, 8)}`,
          requestId: payload.request_id,
          kind: 'status',
          text: payload.text,
          timestamp: payload.timestamp,
          phase: payload.phase,
        });
      });

      unlistenChunk = await listen<AiMessageChunkEvent>('message-chunk', (event) => {
        const payload = event.payload;

        if (payload.request_id !== activeRequestIdRef.current) {
          return;
        }

        setRunState((prev) => (prev === 'finalizing' ? prev : 'running_generating'));

        onMessagesChangeRef.current((currentMessages: Message[]) => {
          const last = currentMessages[currentMessages.length - 1];

          if (last && last.role === 'assistant' && last.requestId === payload.request_id) {
            return [
              ...currentMessages.slice(0, -1),
              { ...last, content: last.content + payload.chunk, isStreaming: true },
            ];
          }

          return [
            ...currentMessages,
            {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              role: 'assistant',
              content: payload.chunk,
              timestamp: Date.now(),
              isStreaming: true,
              requestId: payload.request_id,
            },
          ];
        });
      });

      unlistenToolStart = await listen<AiToolStartEvent>('tool-call-start', (event) => {
        const payload = event.payload;
        if (payload.request_id !== activeRequestIdRef.current) return;

        setRunState('running_tool');
        setCurrentToolCall({
          tool: payload.tool,
          action: payload.action,
          status: 'running',
        });
        appendTimeline({
          id: `${payload.request_id}-${payload.tool}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          requestId: payload.request_id,
          kind: 'tool_start',
          text: payload.action,
          timestamp: Date.now(),
          tool: payload.tool,
        });
      });

      unlistenToolEnd = await listen<AiToolEndEvent>('tool-call-end', (event) => {
        const payload = event.payload;
        if (payload.request_id !== activeRequestIdRef.current) return;

        setCurrentToolCall({
          tool: payload.tool,
          action: payload.success ? '执行成功' : '执行失败',
          status: payload.success ? 'success' : 'error',
          result: payload.result,
        });
        setRunState((prev) => (prev === 'finalizing' ? prev : 'running_thinking'));
        appendTimeline({
          id: `${payload.request_id}-${Date.now()}-tool-end`,
          requestId: payload.request_id,
          kind: 'tool_end',
          text: payload.success ? `${payload.tool} 执行成功` : `${payload.tool} 执行失败`,
          timestamp: Date.now(),
          tool: payload.tool,
          success: payload.success,
        });
      });

      unlistenRequestEnd = await listen<AiRequestEndEvent>('ai-request-end', (event) => {
        const payload = event.payload;
        if (payload.request_id !== activeRequestIdRef.current) return;

        finalizeStreamingMessage(payload.request_id, payload.final_text);

        if (payload.result === 'success') {
          setRunState('completed');
          resetRunIfTerminal();
        } else if (payload.result === 'cancelled') {
          setRunState('cancelled');
          resetRunIfTerminal(450);
        } else {
          setRunState('error');
          if (payload.error_message) {
            setLastError(payload.error_message);
          }
          resetRunIfTerminal(450);
        }

        appendTimeline({
          id: `${payload.request_id}-${payload.timestamp}-end`,
          requestId: payload.request_id,
          kind: 'request_end',
          text:
            payload.result === 'success'
              ? '请求完成'
              : payload.result === 'cancelled'
                ? '请求已取消'
                : `请求失败${payload.error_message ? `: ${payload.error_message}` : ''}`,
          timestamp: payload.timestamp,
          result: payload.result,
        });
      });
    };

    setupListeners();

    return () => {
      if (unlistenChunk) unlistenChunk();
      if (unlistenToolStart) unlistenToolStart();
      if (unlistenToolEnd) unlistenToolEnd();
      if (unlistenRequestStart) unlistenRequestStart();
      if (unlistenStatus) unlistenStatus();
      if (unlistenRequestEnd) unlistenRequestEnd();
    };
  }, []);

  const validProviders = useMemo(() => {
    return availableProviders.filter((provider) => {
      if (!provider.enabled) return false;
      if (!provider.model.trim()) return false;
      if (provider.id !== 'ollama' && !provider.apiKey.trim()) return false;
      return true;
    });
  }, [availableProviders]);

  const modelOptions = useMemo(() => {
    return validProviders.map((provider) => ({
      value: `${provider.id}::${provider.model}`,
      providerId: provider.id,
      providerName: provider.name,
      model: provider.model,
    }));
  }, [validProviders]);

  const selectedModelValid = useMemo(() => {
    return modelOptions.some((option) => option.value === selectedProviderValue);
  }, [modelOptions, selectedProviderValue]);

  const modelStatusText = useMemo(() => {
    if (!workingDirectory) {
      return '请先选择工作目录';
    }

    if (modelOptions.length > 0) {
      if (!selectedProviderValue || !selectedModelValid) {
        return '请先从下拉框选择一个可用模型';
      }
      return null;
    }

    if (availableProviders.length === 0) {
      return '还没有配置任何 Provider，请在设置中添加';
    }

    if (!availableProviders.some((provider) => provider.enabled)) {
      return '没有启用的 Provider，请在设置中启用至少一个';
    }

    if (availableProviders.some((provider) => provider.enabled && !provider.model.trim())) {
      return '存在未填写模型名的 Provider，请先补全 Model';
    }

    if (availableProviders.some((provider) => provider.enabled && provider.id !== 'ollama' && !provider.apiKey.trim())) {
      return '存在缺少 API Key 的 Provider，请先补全';
    }

    return '暂无可用模型，请检查设置';
  }, [availableProviders, modelOptions.length, selectedModelValid, selectedProviderValue, workingDirectory]);

  const newChatDisabledReason = useMemo(() => {
    if (!workingDirectory) return '请先选择工作目录';
    // 不再要求必须选择模型才能新建对话
    return null;
  }, [workingDirectory]);

  const handleSendMessage = async (content: string) => {
    // 先设置运行状态，防止 session 创建时触发的 useEffect 重置状态
    setRunState('running_thinking');
    setLastError(null);

    // 如果是草稿对话，先确保创建真实 session
    try {
      await onEnsureSession();
    } catch (error) {
      const errorMessage = String(error);
      console.error('Failed to ensure session:', errorMessage);
      setRunState('error');
      setLastError(`创建会话失败: ${errorMessage}`);
      appendTimeline({
        id: `${Date.now()}-session-create-error`,
        requestId: activeRequestIdRef.current || 'unknown',
        kind: 'error',
        text: `创建会话失败: ${errorMessage}`,
        timestamp: Date.now(),
      });
      return;
    }

    const newMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    onMessagesChange((prev) => [...prev, newMessage]);

    try {
      await invoke<string>('send_message', { message: content });
    } catch (error) {
      const errorMessage = String(error);
      console.error('send_message failed:', errorMessage);
      if (errorMessage.includes('cancelled') || errorMessage.includes('Cancelled')) {
        return;
      }

      setRunState('error');
      setLastError(errorMessage);
      appendTimeline({
        id: `${Date.now()}-send-error`,
        requestId: activeRequestIdRef.current || 'unknown',
        kind: 'error',
        text: `发送消息失败: ${errorMessage}`,
        timestamp: Date.now(),
      });
      resetRunIfTerminal();
    }
  };

  const handleCancelMessage = async () => {
    if (!canCancel) return;

    setRunState('finalizing');
    appendTimeline({
      id: `${Date.now()}-cancel-request`,
      requestId: activeRequestIdRef.current || 'unknown',
      kind: 'status',
      text: '请求中断中…',
      timestamp: Date.now(),
      phase: 'finalizing',
    });

    try {
      await invoke('cancel_message');
    } catch (error) {
      const errorMessage = String(error);
      setLastError(errorMessage);
      appendTimeline({
        id: `${Date.now()}-cancel-error`,
        requestId: activeRequestIdRef.current || 'unknown',
        kind: 'error',
        text: `中断失败: ${errorMessage}`,
        timestamp: Date.now(),
      });
    }
  };

  const handleSidebarToggle = () => {
    if (isCompact) {
      setIsSidebarDrawerOpen((prev) => !prev);
      return;
    }
    setIsSidebarCollapsed((prev) => !prev);
  };

  const handleInspectorToggle = () => {
    if (isCompact) {
      setIsInspectorDrawerOpen((prev) => !prev);
      return;
    }
    setIsInspectorCollapsed((prev) => !prev);
  };

  const handleTerminalToggle = () => {
    setIsTerminalCollapsed((prev) => !prev);
  };

  return (
    <div className="chat-interface">
      <div className="ide-workspace">
        {!hideSidebar && (
          <Sidebar
            isOpen={isSidebarDrawerOpen}
            collapsed={isSidebarCollapsed}
            isCompact={isCompact}
            onClose={() => setIsSidebarDrawerOpen(false)}
            currentWorkingDirectory={workingDirectory || ''}
            currentSessionId={currentSessionId}
            sessionListRefreshKey={sessionListRefreshKey}
            onSessionSelected={onSessionSelected}
            onSessionDeleted={onSessionDeleted}
          />
        )}

        <div className="chat-main-wrapper">
          <main className="chat-main-column">
          <div className="chat-main-surface">
            {hasActiveSession && !isDraftConversation ? (
              <>
                <MessageList messages={messages} isBusy={isBusy} />
                {currentToolCall && <ToolIndicator toolCall={currentToolCall} />}
                <InputBox
                  onSendMessage={handleSendMessage}
                  onCancelMessage={handleCancelMessage}
                  isBusy={isBusy}
                  canCancel={canCancel}
                  isCancelling={isCancelling}
                  isInputDisabled={isInputDisabled}
                  currentProviderName={currentProviderName}
                  currentModelName={currentModelName}
                />
              </>
            ) : isDraftConversation ? (
              <>
                <div className="draft-conversation-placeholder">
                  <div className="placeholder-content">
                    <div className="placeholder-badge">新对话</div>
                    <h2>开始一个新对话</h2>
                    {modelOptions.length === 0 ? (
                      <>
                        <p>还没有配置可用的模型。请先在设置中添加并启用至少一个 Provider。</p>
                        <button className="settings-link-button" onClick={onSettingsClick}>
                          打开设置
                        </button>
                      </>
                    ) : currentProviderName && currentModelName ? (
                      <p>使用 {currentProviderName} · {currentModelName} 开始对话</p>
                    ) : (
                      <p>请点击"新建"按钮选择一个模型</p>
                    )}
                  </div>
                </div>
                <InputBox
                  onSendMessage={handleSendMessage}
                  onCancelMessage={handleCancelMessage}
                  isBusy={isBusy}
                  canCancel={canCancel}
                  isCancelling={isCancelling}
                  isInputDisabled={isInputDisabled || !selectedProviderValue || !selectedModelValid}
                  currentProviderName={currentProviderName}
                  currentModelName={currentModelName}
                />
              </>
            ) : (
              <div className="no-session-placeholder">
                <div className="placeholder-content">
                  <div className="placeholder-badge">IDE Workspace Ready</div>
                  <h2>欢迎使用 AI IDE 助手</h2>
                  <p>左侧管理会话，中间进行对话，右侧查看模型与工作区信息。点击右上角"新建"开始新的对话。</p>
                </div>
              </div>
            )}
          </div>
          <TerminalPanel collapsed={effectiveTerminalCollapsed} />
        </main>
        </div>

        {isCompact && isInspectorDrawerOpen && (
          <div
            className="inspector-overlay"
            onClick={() => setIsInspectorDrawerOpen(false)}
          ></div>
        )}

        {!hideInspector && (
          <InspectorPanel
            workingDirectory={workingDirectory}
            currentSessionTitle={currentSessionTitle}
            currentSessionId={currentSessionId}
            messageCount={messages.length}
            currentToolCall={currentToolCall}
            runState={runState}
            processTimeline={processTimeline}
            lastError={lastError}
            providerLabel={currentProviderName}
            modelLabel={currentModelName}
            collapsed={isCompact ? !isInspectorDrawerOpen : effectiveInspectorCollapsed}
            isCompact={isCompact}
          />
        )}
      </div>
    </div>
  );
}

export default ChatInterface;
