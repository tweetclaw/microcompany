import React from 'react';
import { AiRunState } from '../types';
import './Toolbar.css';

interface NormalModeToolbarProps {
  workingDirectory: string;
  runState: AiRunState;
  onSettingsClick: () => void;
}

export default function NormalModeToolbar({
  workingDirectory,
  runState,
  onSettingsClick,
}: NormalModeToolbarProps) {
  const getDirectoryName = (path: string) => {
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
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
          <span className="working-dir-path" title={workingDirectory}>
            {getDirectoryName(workingDirectory)}
          </span>
        </div>
        <div className={`toolbar-run-state ${runStateClass}`}>
          <span className="toolbar-run-state-dot" />
          <span>{runStateLabel}</span>
        </div>
      </div>
      <div className="toolbar-right">
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
