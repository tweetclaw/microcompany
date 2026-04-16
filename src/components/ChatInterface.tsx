import React, { useEffect, useMemo, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import Toolbar from './Toolbar';
import MessageList from './MessageList';
import InputBox from './InputBox';
import Sidebar from './Sidebar';
import InspectorPanel from './InspectorPanel';
import { ToolIndicator } from './ToolIndicator';
import { Message, ToolCall } from '../types';
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
  isLoading: boolean;
  onMessagesChange: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  onLoadingChange: (loading: boolean) => void;
  onSessionSelected: (sessionId: string) => void;
  onProviderChange: (value: string) => void;
  onNewChat: () => void;
  hasActiveSession: boolean;
  onSettingsClick: () => void;
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
  isLoading,
  onMessagesChange,
  onLoadingChange,
  onSessionSelected,
  onProviderChange,
  onNewChat,
  hasActiveSession,
  onSettingsClick,
}: ChatInterfaceProps) {
  const [currentToolCall, setCurrentToolCall] = useState<ToolCall | null>(null);
  const initialLayout = useMemo(() => loadLayoutState(), []);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(initialLayout.isSidebarCollapsed);
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(initialLayout.isInspectorCollapsed);
  const [isSidebarDrawerOpen, setIsSidebarDrawerOpen] = useState(false);
  const [isInspectorDrawerOpen, setIsInspectorDrawerOpen] = useState(false);
  const [isCompact, setIsCompact] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 1280 : false);

  const onMessagesChangeRef = useRef(onMessagesChange);
  const onLoadingChangeRef = useRef(onLoadingChange);

  useEffect(() => {
    onMessagesChangeRef.current = onMessagesChange;
    onLoadingChangeRef.current = onLoadingChange;
  }, [onMessagesChange, onLoadingChange]);

  useEffect(() => {
    saveLayoutState({
      isSidebarCollapsed,
      isInspectorCollapsed,
    });
  }, [isSidebarCollapsed, isInspectorCollapsed]);

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

    const setupListeners = async () => {
      unlistenChunk = await listen<string>('message-chunk', (event) => {
        onMessagesChangeRef.current((currentMessages: Message[]) => {
          const last = currentMessages[currentMessages.length - 1];

          if (last && last.role === 'assistant') {
            const isThinking = last.content.includes('思考中');
            const newContent = isThinking ? event.payload : last.content + event.payload;

            return [
              ...currentMessages.slice(0, -1),
              { ...last, content: newContent, isStreaming: true }
            ];
          }

          return [
            ...currentMessages,
            {
              id: Date.now().toString(),
              role: 'assistant',
              content: event.payload,
              timestamp: Date.now(),
              isStreaming: true,
            }
          ];
        });
      });

      unlistenToolStart = await listen<{ tool: string; action: string }>('tool-call-start', (event) => {
        setCurrentToolCall({
          tool: event.payload.tool,
          action: event.payload.action,
          status: 'running',
        });
      });

      unlistenToolEnd = await listen<{ tool: string; success: boolean; result: string }>('tool-call-end', (event) => {
        setCurrentToolCall({
          tool: event.payload.tool,
          action: '',
          status: event.payload.success ? 'success' : 'error',
          result: event.payload.result,
        });

        setTimeout(() => {
          setCurrentToolCall(null);
        }, 2000);
      });
    };

    setupListeners();

    return () => {
      if (unlistenChunk) unlistenChunk();
      if (unlistenToolStart) unlistenToolStart();
      if (unlistenToolEnd) unlistenToolEnd();
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
    if (modelOptions.length === 0) return modelStatusText || '暂无可用模型';
    if (!selectedProviderValue || !selectedModelValid) return '请先选择一个可用模型';
    return null;
  }, [modelOptions.length, modelStatusText, selectedModelValid, selectedProviderValue, workingDirectory]);

  const handleSendMessage = async (content: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    onMessagesChange((prev) => [...prev, newMessage]);
    onLoadingChange(true);

    try {
      await invoke<string>('send_message', { message: content });

      setTimeout(() => {
        onMessagesChange((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant') {
            return [...prev.slice(0, -1), { ...last, isStreaming: false }];
          }
          return prev;
        });
        onLoadingChange(false);
        setCurrentToolCall(null);
      }, 500);
    } catch (error) {
      const errorMessage = String(error);

      if (errorMessage.includes('cancelled') || errorMessage.includes('Cancelled')) {
        onLoadingChange(false);
        setCurrentToolCall(null);
        return;
      }

      console.error('Failed to send message:', error);
      onMessagesChange((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: `❌ 发送消息失败: ${error}`,
          timestamp: Date.now(),
        }
      ]);
      onLoadingChange(false);
      setCurrentToolCall(null);
    }
  };

  const handleCancelMessage = async () => {
    try {
      await invoke('cancel_message');
      onLoadingChange(false);
      setCurrentToolCall(null);
      onMessagesChange((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: 'assistant',
          content: '⏹ 已中断 AI 思考',
          timestamp: Date.now(),
        }
      ]);
    } catch (error) {
      console.error('Failed to cancel message:', error);
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

  return (
    <div className="chat-interface">
      <Toolbar
        workingDirectory={workingDirectory}
        modelOptions={modelOptions}
        selectedModelValue={selectedProviderValue}
        modelStatusText={modelStatusText}
        newChatDisabledReason={newChatDisabledReason}
        onModelChange={onProviderChange}
        onSidebarToggle={handleSidebarToggle}
        onInspectorToggle={handleInspectorToggle}
        onNewChat={onNewChat}
        onSettingsClick={onSettingsClick}
      />

      <div className="ide-workspace">
        <Sidebar
          isOpen={isSidebarDrawerOpen}
          collapsed={isSidebarCollapsed}
          isCompact={isCompact}
          onClose={() => setIsSidebarDrawerOpen(false)}
          currentWorkingDirectory={workingDirectory || ''}
          currentSessionId={currentSessionId}
          onSessionSelected={onSessionSelected}
        />

        <main className="chat-main-column">
          <div className="chat-main-surface">
            {hasActiveSession ? (
              <>
                <MessageList messages={messages} isLoading={isLoading} />
                {currentToolCall && <ToolIndicator toolCall={currentToolCall} />}
                <InputBox
                  onSendMessage={handleSendMessage}
                  onCancelMessage={handleCancelMessage}
                  disabled={!workingDirectory || isLoading}
                  isLoading={isLoading}
                />
              </>
            ) : (
              <div className="no-session-placeholder">
                <div className="placeholder-content">
                  <div className="placeholder-badge">IDE Workspace Ready</div>
                  <h2>欢迎使用 AI IDE 助手</h2>
                  <p>左侧管理会话，中间进行对话，右侧查看模型与工作区信息。先选择模型，再点击“新建”开始新的上下文。</p>
                </div>
              </div>
            )}
          </div>
        </main>

        {isCompact && isInspectorDrawerOpen && (
          <div
            className="inspector-overlay"
            onClick={() => setIsInspectorDrawerOpen(false)}
          ></div>
        )}

        <InspectorPanel
          workingDirectory={workingDirectory}
          currentSessionTitle={currentSessionTitle}
          currentSessionId={currentSessionId}
          messageCount={messages.length}
          currentToolCall={currentToolCall}
          providerLabel={currentProviderName}
          modelLabel={currentModelName}
          collapsed={isCompact ? !isInspectorDrawerOpen : isInspectorCollapsed}
          isCompact={isCompact}
        />
      </div>
    </div>
  );
}

export default ChatInterface;
