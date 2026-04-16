import React from 'react';
import { ToolCall } from '../types';
import './InspectorPanel.css';

interface InspectorPanelProps {
  workingDirectory: string | null;
  currentSessionTitle: string | null;
  currentSessionId: string | null;
  messageCount: number;
  currentToolCall: ToolCall | null;
  providerLabel: string | null;
  modelLabel: string | null;
  collapsed: boolean;
  isCompact: boolean;
}

function InspectorPanel({
  workingDirectory,
  currentSessionTitle,
  currentSessionId,
  messageCount,
  currentToolCall,
  providerLabel,
  modelLabel,
  collapsed,
  isCompact,
}: InspectorPanelProps) {
  const getDirectoryName = (path: string | null) => {
    if (!path) return '未选择';
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
  };

  return (
    <aside
      className={[
        'inspector-panel',
        collapsed ? 'inspector-panel-collapsed' : '',
        isCompact ? 'inspector-panel-compact' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="inspector-header">
        <div>
          <div className="inspector-eyebrow">Workspace</div>
          <h3>Inspector</h3>
        </div>
      </div>

      <div className="inspector-content">
        <section className="inspector-card">
          <div className="inspector-card-title">Session Info</div>
          <div className="inspector-key-value">
            <span>标题</span>
            <strong>{currentSessionTitle || '未开始会话'}</strong>
          </div>
          <div className="inspector-key-value">
            <span>Session ID</span>
            <strong>{currentSessionId || '—'}</strong>
          </div>
          <div className="inspector-key-value">
            <span>消息数</span>
            <strong>{messageCount}</strong>
          </div>
        </section>

        <section className="inspector-card">
          <div className="inspector-card-title">Model Info</div>
          <div className="inspector-key-value">
            <span>Provider</span>
            <strong>{providerLabel || '未选择'}</strong>
          </div>
          <div className="inspector-key-value">
            <span>Model</span>
            <strong>{modelLabel || '未选择'}</strong>
          </div>
        </section>

        <section className="inspector-card">
          <div className="inspector-card-title">Project Info</div>
          <div className="inspector-project-name">{getDirectoryName(workingDirectory)}</div>
          <div className="inspector-project-path" title={workingDirectory || undefined}>
            {workingDirectory || '未选择工作目录'}
          </div>
        </section>

        <section className="inspector-card inspector-card-placeholder">
          <div className="inspector-card-title">Workspace</div>
          <div className="placeholder-tree">
            <div className="placeholder-row">▾ src/</div>
            <div className="placeholder-row placeholder-row-child">▸ components/</div>
            <div className="placeholder-row placeholder-row-child">▸ styles/</div>
            <div className="placeholder-row">▾ context/</div>
            <div className="placeholder-row placeholder-row-child">• Current session</div>
          </div>
          <p className="inspector-placeholder-hint">
            这里会继续接入文件树、上下文和工作区辅助能力。现在先承载会话与模型信息。
          </p>
        </section>

        <section className="inspector-card">
          <div className="inspector-card-title">Activity</div>
          {currentToolCall ? (
            <div className="inspector-activity">
              <div className="activity-status activity-status-running">{currentToolCall.status}</div>
              <div className="activity-tool">{currentToolCall.tool}</div>
              <div className="activity-action">{currentToolCall.action || currentToolCall.result || '执行中'}</div>
            </div>
          ) : (
            <div className="inspector-empty-state">当前没有工具调用</div>
          )}
        </section>
      </div>
    </aside>
  );
}

export default InspectorPanel;
