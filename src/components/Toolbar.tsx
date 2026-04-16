import React from 'react';
import './Toolbar.css';

interface ModelOption {
  value: string;
  providerId: string;
  providerName: string;
  model: string;
}

interface ToolbarProps {
  workingDirectory: string | null;
  modelOptions: ModelOption[];
  selectedModelValue: string;
  modelStatusText: string | null;
  newChatDisabledReason: string | null;
  onModelChange: (value: string) => void;
  onSidebarToggle: () => void;
  onInspectorToggle: () => void;
  onTerminalToggle: () => void;
  onNewChat: () => void;
  onSettingsClick: () => void;
}

function Toolbar({
  workingDirectory,
  modelOptions,
  selectedModelValue,
  modelStatusText,
  newChatDisabledReason,
  onModelChange,
  onSidebarToggle,
  onInspectorToggle,
  onTerminalToggle,
  onNewChat,
  onSettingsClick,
}: ToolbarProps) {
  const getDirectoryName = (path: string) => {
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
  };

  return (
    <div className="toolbar">
      <div className="toolbar-left">
        <div className="toolbar-working-dir">
          <span className="working-dir-label">工作目录</span>
          {workingDirectory ? (
            <span className="working-dir-path" title={workingDirectory}>
              {getDirectoryName(workingDirectory)}
            </span>
          ) : (
            <span className="working-dir-path toolbar-working-dir-empty">
              未选择
            </span>
          )}
        </div>
      </div>
      <div className="toolbar-right">
        <div className="toolbar-model-picker">
          <span className="toolbar-picker-label">对话模型</span>
          <div className="toolbar-model-picker-body">
            <select
              className="toolbar-model-select"
              value={selectedModelValue}
              onChange={(e) => onModelChange(e.target.value)}
              disabled={modelOptions.length === 0}
              title={modelStatusText || '选择会话模型'}
            >
              {modelOptions.length === 0 ? (
                <option value="">暂无可用模型</option>
              ) : (
                modelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.providerName} · {option.model}
                  </option>
                ))
              )}
            </select>
            {modelStatusText && (
              <div className="toolbar-model-status" title={modelStatusText}>
                {modelStatusText}
              </div>
            )}
          </div>
        </div>
        <button
          className="toolbar-new-chat-button"
          onClick={onNewChat}
          disabled={Boolean(newChatDisabledReason)}
          title={newChatDisabledReason || '新建对话'}
        >
          ➕ 新建
        </button>
        <div className="toolbar-divider"></div>
        <button
          className="toolbar-toggle-button"
          onClick={onSidebarToggle}
          title="切换左侧栏"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <rect x="1" y="2" width="5" height="12" rx="1" />
            <rect x="7" y="2" width="8" height="12" rx="1" opacity="0.3" />
          </svg>
        </button>
        <button
          className="toolbar-toggle-button"
          onClick={onInspectorToggle}
          title="切换右侧栏"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <rect x="1" y="2" width="8" height="12" rx="1" opacity="0.3" />
            <rect x="10" y="2" width="5" height="12" rx="1" />
          </svg>
        </button>
        <button
          className="toolbar-toggle-button"
          onClick={onTerminalToggle}
          title="切换底部终端"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <rect x="1" y="2" width="14" height="6" rx="1" opacity="0.3" />
            <rect x="1" y="9" width="14" height="5" rx="1" />
          </svg>
        </button>
        <div className="toolbar-divider"></div>
        <button
          className="toolbar-settings-button"
          onClick={onSettingsClick}
          title="设置"
        >
          ⚙️
        </button>
      </div>
    </div>
  );
}

export default Toolbar;
