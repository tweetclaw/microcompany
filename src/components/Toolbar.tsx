import React, { useState, useRef } from 'react';
import { AiRunState } from '../types';
import ModelDropdown from './ModelDropdown';
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
  newChatDisabledReason: string | null;
  runState: AiRunState;
  onNewChatWithModel: (modelValue: string) => void;
  onNewTask: () => void;
  onSettingsClick: () => void;
}

function Toolbar({
  workingDirectory,
  modelOptions,
  newChatDisabledReason,
  runState,
  onNewChatWithModel,
  onNewTask,
  onSettingsClick,
}: ToolbarProps) {
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const newChatButtonRef = useRef<HTMLButtonElement>(null);

  const getDirectoryName = (path: string) => {
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
  };

  const handleNewChatClick = () => {
    // 如果没有工作目录，不做任何操作
    if (!workingDirectory) return;

    // 如果没有可用模型，显示提示
    if (modelOptions.length === 0) {
      alert('请先在设置中配置至少一个可用的模型');
      return;
    }

    // 如果只有一个模型，直接创建草稿
    if (modelOptions.length === 1) {
      onNewChatWithModel(modelOptions[0].value);
      return;
    }

    // 如果有多个模型，显示下拉菜单
    setShowModelDropdown(true);
  };

  const handleModelSelect = (modelValue: string) => {
    setShowModelDropdown(false);
    onNewChatWithModel(modelValue);
  };

  const handleDropdownCancel = () => {
    setShowModelDropdown(false);
  };

  const runStateLabel =
    runState === 'idle'
      ? 'Idle'
      : runState === 'finalizing'
        ? 'Cancelling'
        : runState === 'error'
          ? 'Error'
          : 'Working';

  const runStateClass =
    runState === 'idle'
      ? 'toolbar-run-state-idle'
      : runState === 'finalizing'
        ? 'toolbar-run-state-cancelling'
        : runState === 'error'
          ? 'toolbar-run-state-error'
          : 'toolbar-run-state-working';

  return (
    <div className="toolbar" data-tauri-drag-region>
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
        <div className={`toolbar-run-state ${runStateClass}`}>
          <span className="toolbar-run-state-dot" />
          <span>{runStateLabel}</span>
        </div>
      </div>
      <div className="toolbar-right">
        <button
          ref={newChatButtonRef}
          className="toolbar-new-chat-button"
          onClick={handleNewChatClick}
          disabled={Boolean(newChatDisabledReason)}
          title={newChatDisabledReason || '新建对话'}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          ➕ 新建
        </button>
        {showModelDropdown && newChatButtonRef.current && (
          <ModelDropdown
            modelOptions={modelOptions}
            onSelectModel={handleModelSelect}
            onCancel={handleDropdownCancel}
            triggerRect={newChatButtonRef.current.getBoundingClientRect()}
          />
        )}
        <button
          className="toolbar-new-task-button"
          onClick={onNewTask}
          disabled={!workingDirectory}
          title={workingDirectory ? '新建任务' : '请先选择工作目录'}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          ➕ New Task
        </button>
        <div className="toolbar-divider"></div>
        <button
          className="toolbar-settings-button"
          onClick={onSettingsClick}
          title="设置"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          ⚙️
        </button>
      </div>
    </div>
  );
}

export default Toolbar;
