import React, { useState, useRef } from 'react';
import SessionList from './SessionList';
import ModelDropdown from './ModelDropdown';
import { ProviderConfig } from '../types';
import './SessionListPanel.css';

interface ModelOption {
  value: string;
  providerId: string;
  providerName: string;
  model: string;
}

interface SessionListPanelProps {
  workingDirectory: string;
  currentSessionId: string | null;
  sessionListRefreshKey: number;
  availableProviders: ProviderConfig[];
  onSessionSelected: (sessionId: string) => void;
  onSessionDeleted: (sessionId: string) => void;
  onNewChatWithModel: (modelValue: string) => void;
}

export default function SessionListPanel({
  workingDirectory,
  currentSessionId,
  sessionListRefreshKey,
  availableProviders,
  onSessionSelected,
  onSessionDeleted,
  onNewChatWithModel,
}: SessionListPanelProps) {
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const newChatButtonRef = useRef<HTMLButtonElement>(null);

  const modelOptions: ModelOption[] = availableProviders.map((provider) => ({
    value: `${provider.id}::${provider.model}`,
    providerId: provider.id,
    providerName: provider.name,
    model: provider.model,
  }));

  const handleNewChatClick = () => {
    if (!workingDirectory) return;

    if (modelOptions.length === 0) {
      alert('请先在设置中配置至少一个可用的模型');
      return;
    }

    if (modelOptions.length === 1) {
      onNewChatWithModel(modelOptions[0].value);
      return;
    }

    setShowModelDropdown(true);
  };

  const handleModelSelect = (modelValue: string) => {
    setShowModelDropdown(false);
    onNewChatWithModel(modelValue);
  };

  const handleDropdownCancel = () => {
    setShowModelDropdown(false);
  };

  return (
    <div className="session-list-panel">
      <div className="session-list-panel-header">
        <button
          ref={newChatButtonRef}
          className="new-chat-button"
          onClick={handleNewChatClick}
        >
          ➕ 新建对话
        </button>
        {showModelDropdown && newChatButtonRef.current && (
          <ModelDropdown
            modelOptions={modelOptions}
            onSelectModel={handleModelSelect}
            onCancel={handleDropdownCancel}
            triggerRect={newChatButtonRef.current.getBoundingClientRect()}
          />
        )}
      </div>
      <SessionList
        workingDirectory={workingDirectory}
        currentSessionId={currentSessionId}
        refreshKey={sessionListRefreshKey}
        onSessionSelected={onSessionSelected}
        onSessionDeleted={onSessionDeleted}
      />
    </div>
  );
}
