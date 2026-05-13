import { useEffect, useMemo, useState, useRef } from 'react';
import type React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Group, Panel, Separator, type Layout } from 'react-resizable-panels';
import { TitleBar } from './TitleBar';
import Toolbar from './Toolbar';
import MessageList from './MessageList';
import InputBox from './InputBox';
import Sidebar from './Sidebar';
import InspectorPanel from './InspectorPanel';
import TerminalPanel from './TerminalPanel';
import { ToolIndicator } from './ToolIndicator';
import './ResizeHandle.css';
import {
  AiActivityPhase,
  AiMessageChunkEvent,
  AiRequestEndEvent,
  AiRequestLifecycleEvent,
  AiRequestStartEvent,
  AiRequestUsageEvent,
  AiRunState,
  AiStatusEvent,
  AiThinkingChunkEvent,
  AiTokenWarningEvent,
  AiToolEndEvent,
  AiToolStartEvent,
  AiTerminalOutcome,
  Message,
  ProcessTimelineItem,
  TimelineItem,
  ToolCall,
} from '../types';
import { ProviderConfig } from '../types/settings';
import { loadLayoutState, saveLayoutState } from '../utils/layoutState';
import { extractHandoffSuggestion } from '../api/handoff';
import { frontendLogger } from '../utils/frontendLogger';
import './ChatInterface.css';

function formatVisibleError(error: string) {
  return error.replace(/^Error:\s*/i, '').trim();
}

function buildVisibleError(error: string) {
  const normalized = formatVisibleError(error);
  const sanitized = normalized.replace(/\s*\([^)]*https?:\/\/[^)]*\)\s*/gi, '').trim();

  if (/error sending request for url/i.test(normalized) || /http error:/i.test(normalized)) {
    return {
      title: 'AI 通讯失败',
      message: '当前模型服务暂时不可达，或请求发送失败。请稍后重试。',
      detail: sanitized || '请求发送失败',
      canRetry: true,
    };
  }

  if (/创建会话失败/i.test(normalized)) {
    return {
      title: '创建会话失败',
      message: '还没有成功建立对话会话，请稍后重试。',
      detail: sanitized,
      canRetry: false,
    };
  }

  return {
    title: '本次请求失败',
    message: sanitized || '发生未知错误，请稍后重试。',
    detail: null,
    canRetry: false,
  };
}

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
  onSessionDeleted?: (deletedSessionId: string, replacementSessionId: string | null) => void;
  onNewChatWithModel: (modelValue: string) => void;
  onNewTask: () => void;
  hasActiveSession: boolean;
  isDraftConversation: boolean;
  onEnsureSession: () => Promise<string | null>;
  onSettingsClick: () => void;
  onCancelRequest?: () => Promise<void>;
  onMessageCompleted?: () => void;
  onHandoffSuggestion?: (event: AiRequestEndEvent) => void;
  onHandoffClick?: (message: Message, handoffRawValue: string, cleanedContent: string) => void;
  onRunStateChange?: (runState: AiRunState) => void;
  availableRoleNames?: string[]; // For Task AI mode handoff observer
  taskRoles?: Array<{ id: string; name: string }>; // Full role objects for ID lookup
  currentRoleName?: string | null;
  hideSidebar?: boolean;
  hideInspector?: boolean;
  hideNewButtons?: boolean;
  hideToolbar?: boolean;
  hideTitleBar?: boolean;
  externalInspectorCollapsed?: boolean;
  externalTerminalCollapsed?: boolean;
  // Global run state — restored when component remounts after view switch
  initialRunState?: AiRunState;
  initialActiveRequestId?: string | null;
  onActiveRequestIdChange?: (id: string | null) => void;
}

const RUNNING_STATES: AiRunState[] = [
  'running_thinking',
  'running_tool',
  'running_generating',
  'finalizing',
];

function mapActivityPhaseToRunState(phase: AiActivityPhase): AiRunState {
  switch (phase) {
    case 'thinking':
      return 'running_thinking';
    case 'tool_running':
      return 'running_tool';
    case 'streaming':
      return 'running_generating';
    case 'finalizing':
      return 'finalizing';
    default:
      return 'running_thinking';
  }
}

function mapTerminalOutcomeToRunState(outcome: AiTerminalOutcome): AiRunState {
  switch (outcome) {
    case 'cancelled':
      return 'cancelled';
    case 'error':
    case 'max_tokens':
    case 'budget_exceeded':
      return 'error';
    // incomplete_tool_use: treat as completed so the input re-enables,
    // the continue button will be shown separately.
    case 'incomplete_tool_use':
      return 'completed';
    default:
      return 'completed';
  }
}

const PANEL_FILL_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

function resolveSuggestedTaskRole(
  suggestedRole: string | null | undefined,
  taskRoles?: Array<{ id: string; name: string }>,
) {
  if (!suggestedRole || !taskRoles?.length) {
    return null;
  }

  const normalizedSuggestedRole = suggestedRole.trim().toLowerCase();
  if (!normalizedSuggestedRole) {
    return null;
  }

  const directMatch = taskRoles.find(
    (role) => role.id.toLowerCase() === normalizedSuggestedRole || role.name.toLowerCase() === normalizedSuggestedRole,
  );

  if (directMatch) {
    return directMatch;
  }

  const shorthandMatch = normalizedSuggestedRole.match(/^(?:role_)?([a-z])$/i);
  if (!shorthandMatch) {
    return null;
  }

  const roleIndex = shorthandMatch[1].charCodeAt(0) - 'a'.charCodeAt(0);
  if (roleIndex < 0 || roleIndex >= taskRoles.length) {
    return null;
  }

  return taskRoles[roleIndex] ?? null;
}

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
  hasActiveSession,
  isDraftConversation,
  onEnsureSession,
  onSettingsClick,
  onMessageCompleted,
  onHandoffSuggestion,
  onHandoffClick,
  onRunStateChange,
  availableRoleNames,
  taskRoles,
  currentRoleName,
  hideSidebar = false,
  hideInspector = false,
  externalInspectorCollapsed,
  externalTerminalCollapsed,
  initialRunState,
  initialActiveRequestId,
  onActiveRequestIdChange,
}: ChatInterfaceProps) {
  // Only restore a running state — terminal states (error/cancelled/completed/idle)
  // should NOT be restored, otherwise the UI gets permanently locked after a view switch
  // that happened post-completion.
  const restoredRunState: AiRunState =
    initialRunState && RUNNING_STATES.includes(initialRunState) ? initialRunState : 'idle';
  const restoredActiveRequestId: string | null =
    restoredRunState !== 'idle' ? (initialActiveRequestId ?? null) : null;

  const [currentToolCall, setCurrentToolCall] = useState<ToolCall | null>(null);
  const [runState, setRunState] = useState<AiRunState>(restoredRunState);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(restoredActiveRequestId);
  const [processTimeline, setProcessTimeline] = useState<ProcessTimelineItem[]>([]);
  const [isRequestDispatching, setIsRequestDispatching] = useState(false);
  const [currentUsage, setCurrentUsage] = useState<AiRequestUsageEvent['usage'] | null>(null);
  const [tokenWarnings, setTokenWarnings] = useState<AiTokenWarningEvent[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const [retryMessageContent, setRetryMessageContent] = useState('');
  const [isCompacting, setIsCompacting] = useState(false);
  const [currentTurn, setCurrentTurn] = useState<number>(0);
  const currentTurnRef = useRef<number>(0);
  const [maxTurns, setMaxTurns] = useState<number>(25);
  const [showContinueButton, setShowContinueButton] = useState(false);
  const [continueButtonReason, setContinueButtonReason] = useState<'max_turns' | 'incomplete_tool_use'>('max_turns');
  const visibleError = useMemo(() => (
    lastError ? buildVisibleError(lastError) : null
  ), [lastError]);

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
  const processTimelineRef = useRef(processTimeline);
  const currentRoleNameRef = useRef<string | null>(currentRoleName ?? null);
  const terminalRequestIdsRef = useRef<Set<string>>(new Set());
  const timelineForRequestRef = useRef<Map<string, TimelineItem[]>>(new Map());

  // Mount log — helps verify whether global runState was correctly restored after view switch
  useEffect(() => {
    console.log('[ChatInterface] mount', {
      currentSessionId,
      restoredRunState,
      restoredActiveRequestId,
      initialRunState,
      initialActiveRequestId,
      wasBusy: restoredRunState !== 'idle',
    });
    return () => {
      console.log('[ChatInterface] unmount', {
        currentSessionId,
        runState: activeRequestIdRef.current ? 'has-active-request' : 'idle',
        activeRequestId: activeRequestIdRef.current,
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    processTimelineRef.current = processTimeline;
  }, [processTimeline]);

  useEffect(() => {
    activeRequestIdRef.current = activeRequestId;
  }, [activeRequestId]);

  useEffect(() => {
    currentRoleNameRef.current = currentRoleName ?? null;
  }, [currentRoleName]);

  useEffect(() => {
    onRunStateChange?.(runState);
  }, [onRunStateChange, runState]);

  useEffect(() => {
    // 如果当前正在运行中（有活跃的请求），不要重置状态
    // 这样可以避免在草稿转换为真实 session 时中断流式显示
    // 注意：必须检查 ref 而不是状态，因为状态更新是异步的
    const isRunning = runState !== 'idle' && activeRequestIdRef.current;
    console.log('[ChatInterface] currentSessionId changed', {
      currentSessionId,
      runState,
      activeRequestId: activeRequestIdRef.current,
      willSkipReset: Boolean(isRunning),
    });
    if (isRunning) {
      return;
    }
    resetConversationRunState();
  }, [currentSessionId]);

  const isBusy = RUNNING_STATES.includes(runState);
  const canCancel = isBusy && (isRequestDispatching || Boolean(activeRequestId));
  const isCancelling = runState === 'finalizing';
  const isInputDisabled = !workingDirectory;

  const appendTimeline = (item: ProcessTimelineItem) => {
    setProcessTimeline((prev) => [...prev, item]);
  };

  const getRequestTimeline = (requestId: string) => timelineForRequestRef.current.get(requestId) || [];

  const setRequestTimeline = (requestId: string, timeline: TimelineItem[]) => {
    timelineForRequestRef.current.set(requestId, timeline);
  };

  const clearRequestTimeline = (requestId?: string | null) => {
    if (!requestId) return;
    timelineForRequestRef.current.delete(requestId);
  };

  const buildMessageContentFromTimeline = (timeline?: TimelineItem[]) => (
    (timeline || [])
      .filter((item) => item.type === 'output')
      .map((item) => item.content || '')
      .join('')
  );

  const normalizeTimeline = (timeline?: TimelineItem[]) => {
    if (!timeline) {
      return undefined;
    }

    return timeline.map((item) => ({
      ...item,
      toolUseId: item.toolUseId,
    }));
  };

  const updateStreamingAssistantMessage = (requestId: string, timeline: TimelineItem[], fallbackContent = '') => {
    const derivedContent = buildMessageContentFromTimeline(timeline) || fallbackContent;

    onMessagesChangeRef.current((currentMessages: Message[]) => {
      const last = currentMessages[currentMessages.length - 1];

      if (last && last.role === 'assistant' && last.requestId === requestId) {
        return [
          ...currentMessages.slice(0, -1),
          { ...last, content: derivedContent, timeline: [...timeline], isStreaming: true },
        ];
      }

      return [
        ...currentMessages,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          role: 'assistant',
          content: derivedContent,
          timestamp: Date.now(),
          isStreaming: true,
          requestId,
          timeline: [...timeline],
        },
      ];
    });
  };

  const finalizeStreamingMessage = (
    requestId?: string | null,
    finalText?: string,
    options?: { hasVisibleText?: boolean; timeline?: any[] },
  ) => {
    onMessagesChangeRef.current((prev: Message[]) => {
      const targetIndex = [...prev]
        .map((message, index) => ({ message, index }))
        .reverse()
        .find(({ message }) => message.role === 'assistant' && (!requestId || message.requestId === requestId))?.index;

      const hasVisibleText = options?.hasVisibleText ?? Boolean(finalText?.trim());

      // Use backend timeline if provided, otherwise fall back to frontend timeline
      const timeline = normalizeTimeline(options?.timeline) ?? (requestId ? getRequestTimeline(requestId) : undefined);

      if (targetIndex === undefined) {
        frontendLogger.info('[ChatInterface] finalizeStreamingMessage missing target', {
          requestId: requestId ?? null,
          hasVisibleText,
          finalTextChars: finalText?.trim().length ?? 0,
        });
        if (hasVisibleText && finalText && finalText.trim()) {
          return [
            ...prev,
            {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              role: 'assistant',
              content: finalText.trim(),
              timestamp: Date.now(),
              isStreaming: false,
              requestId: requestId || undefined,
              timeline: timeline,
            },
          ];
        }
        return prev;
      }

      const targetMessage = prev[targetIndex];
      const trimmedFinalText = finalText?.trim() ?? '';
      const nextContent = hasVisibleText && trimmedFinalText
        ? trimmedFinalText
        : targetMessage.content;
      const contentReplaced = nextContent !== targetMessage.content;

      frontendLogger.info('[ChatInterface] finalizeStreamingMessage target', {
        requestId: requestId ?? null,
        hasVisibleText,
        targetIndex,
        previousContentChars: targetMessage.content.length,
        previousContentPreview: targetMessage.content.slice(0, 160),
        finalTextChars: trimmedFinalText.length,
        finalTextPreview: trimmedFinalText.slice(0, 160),
        contentReplaced,
        nextContentChars: nextContent.length,
      });

      if (!hasVisibleText) {
        return [
          ...prev.slice(0, targetIndex),
          { ...targetMessage, isStreaming: false, timeline: timeline },
          ...prev.slice(targetIndex + 1),
        ];
      }

      // 默认保持前端已累积的完整文本，只在需要移除机器可读后缀时用 final_text 覆盖
      return [
        ...prev.slice(0, targetIndex),
        { ...targetMessage, content: nextContent, isStreaming: false, timeline: timeline },
        ...prev.slice(targetIndex + 1),
      ];
    });
  };

  const resetRunIfTerminal = (delayMs = 0) => {
    const applyReset = () => {
      setCurrentToolCall(null);
      setIsRequestDispatching(false);
      activeRequestIdRef.current = null;
      setActiveRequestId(null);
      onActiveRequestIdChange?.(null);
      setRunState('idle');
      console.log('[ChatInterface] resetRunIfTerminal -> idle', {
        currentRoleName: currentRoleNameRef.current,
        timelineLength: processTimelineRef.current.length,
        activeRequestId: activeRequestIdRef.current,
        isRequestDispatching: false,
      });
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
    setCurrentUsage(null);
    setTokenWarnings([]);
    setProcessTimeline([]);
    setIsRequestDispatching(false);
    terminalRequestIdsRef.current.clear();
    timelineForRequestRef.current.clear();
    activeRequestIdRef.current = null;
    setActiveRequestId(null);
    onActiveRequestIdChange?.(null);
    console.log('[ChatInterface] resetConversationRunState', {
      currentRoleName: currentRoleNameRef.current,
      isRequestDispatching: false,
    });
  };

  useEffect(() => {
    saveLayoutState({
      ...loadLayoutState(),
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
    let unlistenThinkingChunk: (() => void) | null = null;
    let unlistenToolStart: (() => void) | null = null;
    let unlistenToolEnd: (() => void) | null = null;
    let unlistenRequestStart: (() => void) | null = null;
    let unlistenLifecycle: (() => void) | null = null;
    let unlistenUsage: (() => void) | null = null;
    let unlistenTokenWarning: (() => void) | null = null;
    let unlistenStatus: (() => void) | null = null;
    let unlistenCompactStart: (() => void) | null = null;
    let unlistenTurnProgress: (() => void) | null = null;
    let unlistenRequestEnd: (() => void) | null = null;

    const setupListeners = async () => {
      unlistenRequestStart = await listen<AiRequestStartEvent>('ai-request-start', (event) => {
        const payload = event.payload;
        terminalRequestIdsRef.current.delete(payload.request_id);
        console.log('[ChatInterface] ai-request-start', {
          requestId: payload.request_id,
          timestamp: payload.timestamp,
          currentRoleName,
          previousActiveRequestId: activeRequestIdRef.current,
          isRequestDispatching,
        });
        setIsRequestDispatching(false);
        setActiveRequestId(payload.request_id);
        activeRequestIdRef.current = payload.request_id;
        onActiveRequestIdChange?.(payload.request_id);
        setRunState('running_thinking');
        setLastError(null);
        setCurrentToolCall(null);
        setCurrentUsage(null);
        setTokenWarnings([]);
        setProcessTimeline([]);
        setShowContinueButton(false);
        setCurrentTurn(0);
        clearRequestTimeline(payload.request_id);
        appendTimeline({
          id: `${payload.request_id}-${payload.timestamp}-start`,
          requestId: payload.request_id,
          kind: 'request_start',
          text: '请求开始',
          timestamp: payload.timestamp,
        });
      });

      unlistenLifecycle = await listen<AiRequestLifecycleEvent>('ai-request-lifecycle', (event) => {
        const payload = event.payload;
        if (payload.request_id !== activeRequestIdRef.current) return;
        if (terminalRequestIdsRef.current.has(payload.request_id)) {
          console.log('[ChatInterface] ignore terminal ai-request-lifecycle', {
            requestId: payload.request_id,
            phase: payload.phase,
            source: payload.source,
          });
          return;
        }

        console.log('[ChatInterface] ai-request-lifecycle', {
          requestId: payload.request_id,
          phase: payload.phase,
          source: payload.source,
          timestamp: payload.timestamp,
        });

        const nextState = mapActivityPhaseToRunState(payload.phase);

        setRunState(nextState);

        appendTimeline({
          id: `${payload.request_id}-${payload.timestamp}-lifecycle-${payload.phase}`,
          requestId: payload.request_id,
          kind: 'lifecycle',
          text: payload.label || payload.phase,
          timestamp: payload.timestamp,
          phase: payload.phase,
        });
      });

      unlistenUsage = await listen<AiRequestUsageEvent>('ai-request-usage', (event) => {
        const payload = event.payload;
        if (payload.request_id !== activeRequestIdRef.current) return;
        if (terminalRequestIdsRef.current.has(payload.request_id)) {
          console.log('[ChatInterface] ignore terminal ai-request-usage', {
            requestId: payload.request_id,
            scope: payload.scope,
          });
          return;
        }

        console.log('[ChatInterface] ai-request-usage', {
          requestId: payload.request_id,
          scope: payload.scope,
          totalTokens: payload.usage.total_tokens ?? null,
        });

        setCurrentUsage(payload.usage);
      });

      unlistenTokenWarning = await listen<AiTokenWarningEvent>('ai-token-warning', (event) => {
        const payload = event.payload;
        if (payload.request_id !== activeRequestIdRef.current) return;
        if (terminalRequestIdsRef.current.has(payload.request_id)) {
          console.log('[ChatInterface] ignore terminal ai-token-warning', {
            requestId: payload.request_id,
            warningType: payload.warning_type,
          });
          return;
        }

        console.log('[ChatInterface] ai-token-warning', {
          requestId: payload.request_id,
          warningType: payload.warning_type,
          message: payload.message,
        });

        setTokenWarnings((prev) => [...prev, payload]);
        appendTimeline({
          id: `${payload.request_id}-${payload.timestamp}-warning-${payload.warning_type}`,
          requestId: payload.request_id,
          kind: 'warning',
          text: payload.message,
          timestamp: payload.timestamp,
        });
      });

      unlistenStatus = await listen<AiStatusEvent>('ai-status', (event) => {
        const payload = event.payload;
        if (terminalRequestIdsRef.current.has(payload.request_id)) {
          console.log('[ChatInterface] ignore terminal ai-status', {
            requestId: payload.request_id,
            phase: payload.phase,
            timestamp: payload.timestamp,
          });
          return;
        }
        if (payload.request_id !== activeRequestIdRef.current) return;

        console.log('[ChatInterface] ai-status', {
          requestId: payload.request_id,
          phase: payload.phase,
          text: payload.text,
          timestamp: payload.timestamp,
          currentRoleName: currentRoleNameRef.current,
        });

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

        if (terminalRequestIdsRef.current.has(payload.request_id)) {
          console.log('[ChatInterface] ignore terminal message-chunk', {
            requestId: payload.request_id,
            chunkChars: payload.chunk.length,
          });
          return;
        }

        if (payload.request_id !== activeRequestIdRef.current) {
          return;
        }

        console.log('📥 [ChatInterface] Received message-chunk, request_id:', payload.request_id, 'chunk_len:', payload.chunk.length);

        const timeline = getRequestTimeline(payload.request_id);
        const updatedTimeline = timeline.map((item) =>
          item.id === payload.item_id && item.type === 'output'
            ? { ...item, content: (item.content || '') + payload.chunk }
            : item,
        );

        const nextTimeline: TimelineItem[] = updatedTimeline.some((item) => item.id === payload.item_id)
          ? updatedTimeline
          : [
              ...timeline,
              {
                id: payload.item_id,
                messageId: '',
                type: 'output',
                timestamp: payload.timestamp,
                content: payload.chunk,
              },
            ];

        setRequestTimeline(payload.request_id, nextTimeline);
        updateStreamingAssistantMessage(payload.request_id, nextTimeline, payload.chunk);
      });

      unlistenThinkingChunk = await listen<AiThinkingChunkEvent>('thinking-chunk', (event) => {
        const payload = event.payload;

        if (terminalRequestIdsRef.current.has(payload.request_id)) {
          return;
        }

        if (payload.request_id !== activeRequestIdRef.current) {
          return;
        }

        const timeline = getRequestTimeline(payload.request_id);
        const updatedTimeline = timeline.map((item) =>
          item.id === payload.item_id && item.type === 'thinking'
            ? { ...item, content: (item.content || '') + payload.chunk }
            : item,
        );

        const nextTimeline: TimelineItem[] = updatedTimeline.some((item) => item.id === payload.item_id)
          ? updatedTimeline
          : [
              ...timeline,
              {
                id: payload.item_id,
                messageId: '',
                type: 'thinking',
                timestamp: payload.timestamp,
                content: payload.chunk,
              },
            ];

        setRequestTimeline(payload.request_id, nextTimeline);
        updateStreamingAssistantMessage(payload.request_id, nextTimeline);
      });

      unlistenToolStart = await listen<AiToolStartEvent>('tool-call-start', (event) => {
        const payload = event.payload;
        if (terminalRequestIdsRef.current.has(payload.request_id)) {
          console.log('[ChatInterface] ignore terminal tool-call-start', {
            requestId: payload.request_id,
            tool: payload.tool,
            action: payload.action,
          });
          return;
        }
        if (payload.request_id !== activeRequestIdRef.current) return;

        const timeline = getRequestTimeline(payload.request_id);
        const nextTimeline: TimelineItem[] = [
          ...timeline,
          {
            id: payload.item_id,
            messageId: '',
            type: 'tool_call',
            timestamp: payload.timestamp,
            tool: payload.tool,
            action: payload.action,
            status: 'running',
            toolUseId: payload.tool_use_id,
          },
        ];
        setRequestTimeline(payload.request_id, nextTimeline);
        updateStreamingAssistantMessage(payload.request_id, nextTimeline);

        setCurrentToolCall({
          tool: payload.tool,
          action: payload.action,
          status: 'running',
        });
        appendTimeline({
          id: `${payload.request_id}-${payload.tool}-${payload.timestamp}-${Math.random().toString(36).slice(2, 9)}`,
          requestId: payload.request_id,
          kind: 'tool_start',
          text: payload.action,
          timestamp: payload.timestamp,
          tool: payload.tool,
        });
      });

      unlistenToolEnd = await listen<AiToolEndEvent>('tool-call-end', (event) => {
        const payload = event.payload;
        if (terminalRequestIdsRef.current.has(payload.request_id)) {
          console.log('[ChatInterface] ignore terminal tool-call-end', {
            requestId: payload.request_id,
            tool: payload.tool,
            success: payload.success,
          });
          return;
        }
        if (payload.request_id !== activeRequestIdRef.current) return;

        const timeline = getRequestTimeline(payload.request_id);
        const updatedTimeline: TimelineItem[] = timeline.map(item => {
          if (item.type === 'tool_call' && item.toolUseId === payload.tool_use_id) {
            return {
              ...item,
              id: payload.item_id,
              status: payload.success ? 'success' : 'error',
              result: payload.result,
            };
          }
          return item;
        });
        setRequestTimeline(payload.request_id, updatedTimeline);
        updateStreamingAssistantMessage(payload.request_id, updatedTimeline);

        setCurrentToolCall({
          tool: payload.tool,
          action: payload.success ? '执行成功' : '执行失败',
          status: payload.success ? 'success' : 'error',
          result: payload.result,
        });
        appendTimeline({
          id: `${payload.request_id}-${payload.timestamp}-tool-end`,
          requestId: payload.request_id,
          kind: 'tool_end',
          text: payload.success ? `${payload.tool} 执行成功` : `${payload.tool} 执行失败`,
          timestamp: payload.timestamp,
          tool: payload.tool,
          success: payload.success,
        });
      });

      unlistenCompactStart = await listen('ai-compact-start', (event: any) => {
        const payload = event.payload;
        console.log('[ChatInterface] ai-compact-start', {
          requestId: payload.request_id,
          sessionId: payload.session_id,
          pctUsed: payload.pct_used,
          timestamp: payload.timestamp,
        });

        setIsCompacting(true);
        appendTimeline({
          id: `${payload.request_id}-${payload.timestamp}-compact-start`,
          requestId: payload.request_id,
          kind: 'lifecycle',
          text: '正在压缩上下文...',
          timestamp: payload.timestamp,
        });
      });

      unlistenTurnProgress = await listen('ai-turn-progress', (event: any) => {
        const payload = event.payload;
        currentTurnRef.current = payload.currentTurn;
        setCurrentTurn(payload.currentTurn);
        setMaxTurns(payload.maxTurns);
      });

      unlistenRequestEnd = await listen<AiRequestEndEvent>('ai-request-end', async (event) => {
        const payload = event.payload;
        if (terminalRequestIdsRef.current.has(payload.request_id)) {
          frontendLogger.info('[ChatInterface] ignore duplicate ai-request-end', {
            requestId: payload.request_id,
            result: payload.result,
            timestamp: payload.timestamp,
          });
          return;
        }
        if (payload.request_id !== activeRequestIdRef.current) return;

        terminalRequestIdsRef.current.add(payload.request_id);

        frontendLogger.info('[ChatInterface] mark request terminal', {
          requestId: payload.request_id,
          outcome: payload.outcome,
          reasonCode: payload.reason_code ?? null,
          currentRoleName: currentRoleNameRef.current,
        });

        frontendLogger.info('[ChatInterface] ai-request-end', {
          requestId: payload.request_id,
          result: payload.result,
          outcome: payload.outcome,
          reasonCode: payload.reason_code ?? null,
          activityPhaseAtEnd: payload.activity_phase_at_end,
          timestamp: payload.timestamp,
          hasError: Boolean(payload.error_message),
          hasVisibleText: payload.has_visible_text ?? null,
          finalTextChars: payload.final_text?.length ?? 0,
          currentRoleName: currentRoleNameRef.current,
        });
        let accumulatedText = '';
        let hadAssistantMessageForRequest = false;
        let lastAssistantMessageContent = '';
        onMessagesChangeRef.current((currentMessages: Message[]) => {
          const lastAssistantMsg = [...currentMessages]
            .reverse()
            .find((msg) => msg.role === 'assistant' && msg.requestId === payload.request_id);
          if (lastAssistantMsg) {
            accumulatedText = lastAssistantMsg.content;
            hadAssistantMessageForRequest = true;
          }

          // For completed_tool_only, also check the last assistant message regardless of requestId
          const lastAssistantMsgAny = [...currentMessages]
            .reverse()
            .find((msg) => msg.role === 'assistant');
          if (lastAssistantMsgAny) {
            lastAssistantMessageContent = lastAssistantMsgAny.content;
          }
          return currentMessages;
        });

        const hasVisibleText = payload.has_visible_text ?? Boolean(payload.final_text?.trim());
        const finalText = hasVisibleText ? payload.final_text?.trim() ?? '' : '';
        const streamedVisibleText = accumulatedText.trim();
        const hadStreamedVisibleText = streamedVisibleText.length > 0;

        // For completed_tool_only: check if ANY assistant message has visible text
        // This prevents showing "no visible text" notice when user already saw AI's response
        const hasAnyAssistantText = lastAssistantMessageContent.trim().length > 0;
        const shouldShowToolOnlyNotice = payload.outcome === 'completed_tool_only' && !hadStreamedVisibleText && !hasAnyAssistantText;
        const resolvedUsage = payload.usage ?? currentUsage;
        const resolvedWarnings = payload.warnings ?? tokenWarnings.map(({ warning_type, message }) => ({ warning_type, message }));
        const terminalRunState = mapTerminalOutcomeToRunState(payload.outcome);
        const shouldDelayReset = payload.outcome === 'cancelled' || terminalRunState === 'error';

        frontendLogger.info('[ChatInterface] finalize request', {
          requestId: payload.request_id,
          hasVisibleText,
          finalTextChars: finalText.length,
          accumulatedTextChars: accumulatedText.length,
          hadAssistantMessageForRequest,
          hadStreamedVisibleText,
          hasAnyAssistantText,
          lastAssistantMessageContentChars: lastAssistantMessageContent.length,
          shouldShowToolOnlyNotice,
          activeRequestId: activeRequestIdRef.current,
          timelineLength: processTimelineRef.current.length,
          backendTimelineLength: payload.timeline?.length ?? 0,
          outcome: payload.outcome,
          terminalRunState,
        });

        finalizeStreamingMessage(payload.request_id, finalText, { hasVisibleText, timeline: normalizeTimeline(payload.timeline as TimelineItem[] | undefined) });
        setCurrentUsage(resolvedUsage ?? null);
        setTokenWarnings(resolvedWarnings.map((warning) => ({
          request_id: payload.request_id,
          session_id: payload.session_id ?? currentSessionId ?? '',
          warning_type: warning.warning_type,
          message: warning.message,
          timestamp: payload.timestamp,
        })));

        frontendLogger.info('[ChatInterface] finalizeStreamingMessage complete', {
          requestId: payload.request_id,
          hasVisibleText,
          finalTextChars: finalText.length,
        });

        let timelineText = '请求完成';

        if (payload.outcome === 'completed_tool_only') {
          if (shouldShowToolOnlyNotice) {
            appendTimeline({
              id: `${payload.request_id}-${payload.timestamp}-no-visible-text`,
              requestId: payload.request_id,
              kind: 'status',
              text: '工具已执行完成，但本轮未返回可显示文本',
              timestamp: payload.timestamp,
              phase: payload.activity_phase_at_end,
            });
          } else {
            frontendLogger.info('[ChatInterface] suppress completed_tool_only fallback notice because streamed text already exists', {
              requestId: payload.request_id,
              accumulatedTextChars: accumulatedText.length,
              streamedVisibleText: streamedVisibleText.slice(0, 160),
              hasAnyAssistantText,
              lastAssistantMessageContentChars: lastAssistantMessageContent.length,
              lastAssistantMessageContentPreview: lastAssistantMessageContent.slice(0, 160),
            });
          }
          timelineText = '请求完成（仅工具结果）';
        } else if (payload.outcome === 'incomplete_tool_use') {
          timelineText = '请求异常中断：AI 生成了工具调用但未能执行，请点击"继续"重试';
        } else if (payload.outcome === 'handoff_ready') {
          timelineText = '请求完成（可交接）';
        } else if (payload.outcome === 'cancelled') {
          timelineText = '请求已取消';
        } else if (payload.outcome === 'max_tokens') {
          timelineText = `请求因上下文限制结束${payload.error_message ? `: ${payload.error_message}` : ''}`;
        } else if (payload.outcome === 'budget_exceeded') {
          timelineText = `请求因预算限制结束${payload.error_message ? `: ${payload.error_message}` : ''}`;
        } else if (terminalRunState === 'error') {
          timelineText = `请求失败${payload.error_message ? `: ${payload.error_message}` : ''}`;
        }

        appendTimeline({
          id: `${payload.request_id}-${payload.timestamp}-end`,
          requestId: payload.request_id,
          kind: 'request_end',
          text: timelineText,
          timestamp: payload.timestamp,
          phase: payload.activity_phase_at_end,
          result: payload.result,
          outcome: payload.outcome,
        });

        frontendLogger.info('[ChatInterface] terminal outcome applied', {
          requestId: payload.request_id,
          outcome: payload.outcome,
          terminalRunState,
          timelineText,
          shouldDelayReset,
        });

        setRunState(terminalRunState);

        if (terminalRunState === 'error' && payload.error_message) {
          setLastError(payload.error_message);
        }

        if (payload.handoffSuggestion && onHandoffSuggestion) {
          console.log('✅ [ChatInterface] 后端直接提供了 handoffSuggestion');
          onHandoffSuggestion(payload);
          if (onMessageCompleted) {
            onMessageCompleted();
          }
          console.log('[ChatInterface] reset after backend handoff suggestion', {
            requestId: payload.request_id,
            outcome: payload.outcome,
          });
          resetRunIfTerminal();
          return;
        }

        if (payload.outcome === 'completed' && hasVisibleText && onHandoffSuggestion && currentRoleNameRef.current && finalText) {
          console.log('🎯 [ChatInterface] 尝试 observer fallback 检测 handoff');
          console.log('🎯 [ChatInterface] 当前角色:', currentRoleNameRef.current);
          console.log('🎯 [ChatInterface] 消息长度:', finalText.length, '字符');

          try {
            console.log('🎯 [ChatInterface] 调用观察者 API...');
            const roles = availableRoleNames || [];
            console.log('🎯 [ChatInterface] 可用角色:', roles);
            const handoffInfo = await extractHandoffSuggestion(currentRoleNameRef.current, finalText, roles);

            console.log('✅ [ChatInterface] 观察者返回结果:', handoffInfo);
            console.log('✅ [ChatInterface] has_handoff:', handoffInfo.hasHandoff);

            if (handoffInfo.hasHandoff) {
              console.log('✅ [ChatInterface] observer fallback 检测到交接意图');
              console.log('✅ [ChatInterface] 推荐角色:', handoffInfo.suggestedRole);
              console.log('✅ [ChatInterface] 完整消息长度:', handoffInfo.fullMessage.length);

              const targetRole = resolveSuggestedTaskRole(handoffInfo.suggestedRole, taskRoles);
              const targetRoleId = targetRole?.id || null;

              console.log('✅ [ChatInterface] 角色名称转换: ', handoffInfo.suggestedRole, '->', targetRoleId, targetRole?.name);

              const handoffSuggestion = {
                recommended: true,
                targetRoleId: targetRoleId,
                targetRoleName: handoffInfo.suggestedRole || '',
                reason: 'observer fallback',
                draftMessage: '',
                fullMessage: handoffInfo.fullMessage,
              };

              console.log('✅ [ChatInterface] 触发 onHandoffSuggestion 回调（observer fallback）');
              onHandoffSuggestion({ ...payload, handoffSuggestion });
              if (onMessageCompleted) {
                onMessageCompleted();
              }
              console.log('[ChatInterface] reset after observer fallback handoff', {
                requestId: payload.request_id,
                targetRoleId,
                targetRoleName: handoffInfo.suggestedRole || '',
              });
              resetRunIfTerminal();
              return;
            }

            console.log('ℹ️ [ChatInterface] observer fallback：无交接意图');
          } catch (error) {
            console.error('❌ [ChatInterface] observer fallback 失败，回退到标签解析:', error);
          }
        }

        if (payload.outcome === 'completed' && finalText && onHandoffSuggestion) {
          console.log('🔄 [ChatInterface] 检查 regex fallback 标签解析');
          const handoffMatch = finalText.match(/\[HANDOFF\]([\s\S]*?)\[\/HANDOFF\]/);
          if (handoffMatch) {
            console.log('✅ [ChatInterface] regex fallback 找到 HANDOFF 标签');
            const handoffContent = handoffMatch[1];
            const lines = handoffContent.split('\n').map(line => line.trim()).filter(line => line);
            const fields: Record<string, string> = {};
            for (const line of lines) {
              const colonIndex = line.indexOf(':');
              if (colonIndex > 0) {
                const key = line.substring(0, colonIndex).trim().toLowerCase();
                const value = line.substring(colonIndex + 1).trim();
                fields[key] = value;
              }
            }

            const recommended = fields['recommended']?.toLowerCase() === 'yes';
            if (recommended && fields['target_role']) {
              console.log('✅ [ChatInterface] regex fallback 解析成功，推荐角色:', fields['target_role']);
              const handoffSuggestion = {
                recommended: true,
                targetRoleId: null,
                targetRoleName: fields['target_role'],
                reason: 'regex fallback',
                draftMessage: fields['draft_message'] || '',
              };
              console.log('✅ [ChatInterface] 触发 onHandoffSuggestion 回调（regex fallback）');
              onHandoffSuggestion({ ...payload, handoffSuggestion });
            } else {
              console.log('ℹ️ [ChatInterface] regex fallback：未推荐交接');
            }
          } else {
            console.log('ℹ️ [ChatInterface] regex fallback：未找到 HANDOFF 标签');
          }
        }

        if (onMessageCompleted && terminalRunState === 'completed') {
          onMessageCompleted();
        }

        // Clear compact state when request ends
        if (isCompacting) {
          setIsCompacting(false);
          appendTimeline({
            id: `${payload.request_id}-${payload.timestamp}-compact-end`,
            requestId: payload.request_id,
            kind: 'lifecycle',
            text: '上下文压缩完成',
            timestamp: payload.timestamp,
          });
        }

        // Check if stopped due to max turns limit
        // Use ref to avoid stale closure (currentTurn state is captured at listener registration time)
        if (currentTurnRef.current >= maxTurns && terminalRunState === 'completed') {
          setContinueButtonReason('max_turns');
          setShowContinueButton(true);
        }

        console.log('[ChatInterface] scheduling terminal reset', {
          requestId: payload.request_id,
          delayMs: shouldDelayReset ? 450 : 0,
          terminalRunState,
          outcome: payload.outcome,
        });

        resetRunIfTerminal(shouldDelayReset ? 450 : 0);
      });
    };

    setupListeners();

    return () => {
      if (unlistenChunk) unlistenChunk();
      if (unlistenThinkingChunk) unlistenThinkingChunk();
      if (unlistenToolStart) unlistenToolStart();
      if (unlistenToolEnd) unlistenToolEnd();
      if (unlistenRequestStart) unlistenRequestStart();
      if (unlistenLifecycle) unlistenLifecycle();
      if (unlistenUsage) unlistenUsage();
      if (unlistenTokenWarning) unlistenTokenWarning();
      if (unlistenStatus) unlistenStatus();
      if (unlistenCompactStart) unlistenCompactStart();
      if (unlistenTurnProgress) unlistenTurnProgress();
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

  const handleContinue = () => {
    setShowContinueButton(false);
    setContinueButtonReason('max_turns'); // reset to default
    handleSendMessage('请继续');
  };

  const handleSendMessage = async (content: string) => {
    setRetryMessageContent(content);
    // 先设置运行状态，防止 session 创建时触发的 useEffect 重置状态
    setRunState('running_thinking');
    setIsRequestDispatching(true);
    setLastError(null);

    console.log('[ChatInterface] handleSendMessage start', {
      contentChars: content.length,
      currentSessionId,
      currentRoleName: currentRoleNameRef.current,
      activeRequestId: activeRequestIdRef.current,
      runState,
      isRequestDispatching: true,
    });

    // 如果是草稿对话，先确保创建真实 session
    try {
      await onEnsureSession();
    } catch (error) {
      const errorMessage = String(error);
      console.error('Failed to ensure session:', errorMessage);
      setIsRequestDispatching(false);
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
      console.log('[ChatInterface] send_message invoke', {
        contentChars: content.length,
        currentSessionId,
        currentRoleName: currentRoleNameRef.current,
        activeRequestId: activeRequestIdRef.current,
        isRequestDispatching: true,
      });
      await invoke<string>('send_message', { message: content });
      console.log('[ChatInterface] send_message invoke resolved', {
        contentChars: content.length,
        currentSessionId,
        currentRoleName: currentRoleNameRef.current,
        activeRequestId: activeRequestIdRef.current,
        isRequestDispatching,
      });
    } catch (error) {
      const errorMessage = String(error);
      console.error('send_message failed:', errorMessage);
      if (errorMessage.includes('cancelled') || errorMessage.includes('Cancelled')) {
        return;
      }

      setIsRequestDispatching(false);
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
    console.log('[ChatInterface] handleCancelMessage clicked', {
      canCancel,
      runState,
      activeRequestId: activeRequestIdRef.current,
      isRequestDispatching,
    });

    if (!canCancel) {
      return;
    }

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
      const isDispatchRace = isRequestDispatching && errorMessage.includes('No active message to cancel');

      console.warn('[ChatInterface] cancel_message failed', {
        errorMessage,
        canCancel,
        runState,
        activeRequestId: activeRequestIdRef.current,
        isRequestDispatching,
        isDispatchRace,
      });

      if (isDispatchRace) {
        setRunState('running_thinking');
        return;
      }

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

  const handleRetryLastMessage = async () => {
    if (!retryMessageContent || isBusy) return;
    await handleSendMessage(retryMessageContent);
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

  const handleHorizontalLayoutChanged = (layout: Layout) => {
    const size = layout['chat-inspector'];
    if (typeof size !== 'number' || !Number.isFinite(size)) return;
    const current = loadLayoutState();
    if (Math.abs(current.inspectorSize - size) < 0.01) return;
    saveLayoutState({ ...current, inspectorSize: size });
  };

  const handleVerticalLayoutChanged = (layout: Layout) => {
    const size = layout['terminal'];
    if (typeof size !== 'number' || !Number.isFinite(size)) return;
    const current = loadLayoutState();
    if (Math.abs(current.terminalSize - size) < 0.01) return;
    saveLayoutState({ ...current, terminalSize: size });
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

        <Group orientation="horizontal" className="chat-horizontal-group" onLayoutChanged={handleHorizontalLayoutChanged}>
          <Panel minSize="30%" style={PANEL_FILL_STYLE}>
            <div className="chat-main-wrapper">
              <main className="chat-main-column">
                <Group orientation="vertical" className="chat-vertical-group" onLayoutChanged={handleVerticalLayoutChanged}>
              <Panel minSize="30%" style={PANEL_FILL_STYLE}>
                <div className="chat-main-surface">
                  {hasActiveSession && !isDraftConversation ? (
                    <>
                      {visibleError && (
                        <div className="chat-error-banner" role="alert" aria-live="assertive">
                          <div className="chat-error-banner-label">{visibleError.title}</div>
                          <div className="chat-error-banner-message">{visibleError.message}</div>
                          {visibleError.detail && (
                            <div className="chat-error-banner-detail">技术详情：{visibleError.detail}</div>
                          )}
                          {visibleError.canRetry && retryMessageContent && (
                            <div className="chat-error-banner-actions">
                              <button
                                type="button"
                                className="chat-error-banner-retry"
                                onClick={() => { void handleRetryLastMessage(); }}
                                disabled={isBusy}
                              >
                                重试
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      <MessageList messages={messages} isBusy={isBusy} onRetry={handleSendMessage} onHandoffClick={onHandoffClick} />
                      {currentToolCall && <ToolIndicator toolCall={currentToolCall} />}
                      {showContinueButton && (
                        <div style={{
                          padding: '12px 16px',
                          backgroundColor: continueButtonReason === 'incomplete_tool_use' ? '#fff7ed' : '#f0f9ff',
                          border: `1px solid ${continueButtonReason === 'incomplete_tool_use' ? '#fed7aa' : '#bae6fd'}`,
                          borderRadius: '8px',
                          margin: '12px 0'
                        }}>
                          <div style={{ marginBottom: '8px', color: continueButtonReason === 'incomplete_tool_use' ? '#9a3412' : '#0369a1', fontSize: '14px' }}>
                            {continueButtonReason === 'incomplete_tool_use'
                              ? '⚠️ AI 生成了工具调用但未能执行（模型异常中断），点击继续让 AI 重新尝试'
                              : `⚠️ AI 已达到最大轮次限制（${maxTurns} 轮）`}
                          </div>
                          <button
                            onClick={handleContinue}
                            style={{
                              padding: '8px 16px',
                              backgroundColor: continueButtonReason === 'incomplete_tool_use' ? '#ea580c' : '#0ea5e9',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '14px',
                              fontWeight: '500'
                            }}
                          >
                            继续执行
                          </button>
                        </div>
                      )}
                      <InputBox
                        onSendMessage={handleSendMessage}
                        onCancelMessage={handleCancelMessage}
                        isBusy={isBusy || isCompacting}
                        canCancel={canCancel}
                        isCancelling={isCancelling}
                        isInputDisabled={isInputDisabled || isCompacting}
                        currentProviderName={currentProviderName}
                        currentModelName={currentModelName}
                        placeholderText={isCompacting ? '正在压缩上下文，请稍候...' : undefined}
                      />
                    </>
                  ) : isDraftConversation ? (
                    <>
                      {visibleError && (
                        <div className="chat-error-banner" role="alert" aria-live="assertive">
                          <div className="chat-error-banner-label">{visibleError.title}</div>
                          <div className="chat-error-banner-message">{visibleError.message}</div>
                          {visibleError.detail && (
                            <div className="chat-error-banner-detail">技术详情：{visibleError.detail}</div>
                          )}
                          {visibleError.canRetry && retryMessageContent && (
                            <div className="chat-error-banner-actions">
                              <button
                                type="button"
                                className="chat-error-banner-retry"
                                onClick={() => { void handleRetryLastMessage(); }}
                                disabled={isBusy}
                              >
                                重试
                              </button>
                            </div>
                          )}
                        </div>
                      )}
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
                        isBusy={isBusy || isCompacting}
                        canCancel={canCancel}
                        isCancelling={isCancelling}
                        isInputDisabled={isInputDisabled || !selectedProviderValue || !selectedModelValid || isCompacting}
                        currentProviderName={currentProviderName}
                        currentModelName={currentModelName}
                        placeholderText={isCompacting ? '正在压缩上下文，请稍候...' : undefined}
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
              </Panel>
              {!effectiveTerminalCollapsed && (
                <>
                  <Separator />
                  <Panel id="terminal" defaultSize={`${initialLayout.terminalSize}%`} minSize="10%" maxSize="60%" style={PANEL_FILL_STYLE}>
                    <TerminalPanel collapsed={false} />
                  </Panel>
                </>
              )}
                </Group>
              </main>
            </div>
          </Panel>
          {!hideInspector && !effectiveInspectorCollapsed && !isCompact && (
            <>
              <Separator />
              <Panel id="chat-inspector" defaultSize={`${initialLayout.inspectorSize}%`} minSize="20%" maxSize="45%" style={PANEL_FILL_STYLE}>
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
                  currentUsage={currentUsage}
                  tokenWarnings={tokenWarnings.map(({ warning_type, message }) => ({ warning_type, message }))}
                  currentTurn={currentTurn}
                  maxTurns={maxTurns}
                  collapsed={false}
                  isCompact={false}
                />
              </Panel>
            </>
          )}
        </Group>

        {isCompact && isInspectorDrawerOpen && (
          <div
            className="inspector-overlay"
            onClick={() => setIsInspectorDrawerOpen(false)}
          ></div>
        )}

        {!hideInspector && isCompact && (
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
            currentUsage={currentUsage}
            tokenWarnings={tokenWarnings.map(({ warning_type, message }) => ({ warning_type, message }))}
            currentTurn={currentTurn}
            maxTurns={maxTurns}
            collapsed={!isInspectorDrawerOpen}
            isCompact={true}
          />
        )}
      </div>
    </div>
  );
}

export default ChatInterface;
