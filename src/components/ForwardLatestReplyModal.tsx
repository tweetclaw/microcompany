import React, { useState } from 'react';
import { HandoffSuggestion, Message, Task } from '../types';
import './ForwardLatestReplyModal.css';

interface ForwardLatestReplyModalProps {
  task: Task;
  currentRoleId: string;
  messages: Message[];
  suggestion?: HandoffSuggestion | null;
  onForward: (targetRoleId: string, note: string) => Promise<void>;
  onCancel: () => void;
}

function getRoleArchetypeLabel(identity: string, archetypeId: string | null) {
  if (archetypeId === 'custom') {
    return 'Custom archetype';
  }
  return identity;
}

function ForwardLatestReplyModal({
  task,
  currentRoleId,
  messages,
  suggestion,
  onForward,
  onCancel,
}: ForwardLatestReplyModalProps) {
  const [targetRoleId, setTargetRoleId] = useState(suggestion?.targetRoleId ?? '');
  const [note, setNote] = useState(suggestion?.draftMessage ?? '');
  const [isForwarding, setIsForwarding] = useState(false);

  const currentRole = task.roles.find((r) => r.id === currentRoleId);
  const otherRoles = task.roles.filter((r) => r.id !== currentRoleId);

  const latestAssistantMessage = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant');

  const handleForward = async () => {
    if (!targetRoleId) {
      alert('请选择接手人员');
      return;
    }

    setIsForwarding(true);
    try {
      await onForward(targetRoleId, note);
    } finally {
      setIsForwarding(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="forward-modal" style={{ maxWidth: '600px' }}>
        <div className="modal-header" style={{
          padding: '24px 24px 20px',
          borderBottom: '1px solid var(--border-default)'
        }}>
          <h3 style={{
            margin: 0,
            fontSize: '20px',
            fontWeight: '600',
            color: 'var(--text-primary)'
          }}>
            🔄 工作交接
          </h3>
          <p style={{
            margin: '8px 0 0',
            fontSize: '14px',
            color: 'var(--text-secondary)',
            lineHeight: '1.5'
          }}>
            <strong>{currentRole?.name}</strong> 完成了当前工作，请选择接手人员继续处理
          </p>
        </div>

        <div className="modal-body" style={{ padding: '24px' }}>
          {suggestion && suggestion.recommended && (
            <div style={{
              padding: '16px',
              background: 'rgba(59, 130, 246, 0.08)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              borderRadius: '8px',
              marginBottom: '24px'
            }}>
              <div style={{
                fontSize: '13px',
                fontWeight: '600',
                color: '#3b82f6',
                marginBottom: '8px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                💡 AI 推荐
              </div>
              <div style={{
                fontSize: '15px',
                fontWeight: '600',
                color: 'var(--text-primary)',
                marginBottom: '6px'
              }}>
                {suggestion.targetRoleName ?? '未识别'}
              </div>
              <div style={{
                fontSize: '14px',
                color: 'var(--text-secondary)',
                lineHeight: '1.5'
              }}>
                {suggestion.reason}
              </div>
            </div>
          )}

          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: '600',
              color: 'var(--text-primary)',
              marginBottom: '8px'
            }}>
              选择接手人员 *
            </label>
            {otherRoles.length === 0 ? (
              <div className="no-roles-warning">
                当前任务中没有其他团队成员
              </div>
            ) : (
              <select
                value={targetRoleId}
                onChange={(e) => setTargetRoleId(e.target.value)}
                disabled={isForwarding || !latestAssistantMessage}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  fontSize: '15px',
                  border: '2px solid var(--border-default)',
                  borderRadius: '8px',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer'
                }}
              >
                <option value="">请选择...</option>
                {otherRoles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name} ({getRoleArchetypeLabel(role.identity, role.archetype_id)})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: '600',
              color: 'var(--text-primary)',
              marginBottom: '8px'
            }}>
              交接说明（可选）
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="可以添加一些背景信息或具体要求..."
              rows={3}
              disabled={isForwarding || !latestAssistantMessage}
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: '14px',
                border: '2px solid var(--border-default)',
                borderRadius: '8px',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                resize: 'vertical',
                fontFamily: 'inherit',
                lineHeight: '1.5'
              }}
            />
          </div>
        </div>

        <div style={{
          display: 'flex',
          gap: '12px',
          padding: '20px 24px',
          borderTop: '1px solid var(--border-default)',
          background: 'var(--bg-secondary)'
        }}>
          <button
            onClick={onCancel}
            disabled={isForwarding}
            style={{
              flex: 1,
              padding: '16px 24px',
              fontSize: '16px',
              fontWeight: '600',
              borderRadius: '8px',
              border: '2px solid var(--border-default)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              cursor: isForwarding ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s'
            }}
          >
            取消
          </button>
          <button
            onClick={handleForward}
            disabled={isForwarding || !targetRoleId || !latestAssistantMessage || otherRoles.length === 0}
            style={{
              flex: 2,
              padding: '16px 24px',
              fontSize: '16px',
              fontWeight: '600',
              borderRadius: '8px',
              border: 'none',
              background: isForwarding || !targetRoleId || !latestAssistantMessage || otherRoles.length === 0
                ? '#94a3b8'
                : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
              color: 'white',
              cursor: isForwarding || !targetRoleId || !latestAssistantMessage || otherRoles.length === 0 ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              boxShadow: isForwarding || !targetRoleId || !latestAssistantMessage || otherRoles.length === 0
                ? 'none'
                : '0 4px 12px rgba(59, 130, 246, 0.3)'
            }}
          >
            {isForwarding ? '⏳ 交接中...' : '✓ 确认交接'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ForwardLatestReplyModal;
