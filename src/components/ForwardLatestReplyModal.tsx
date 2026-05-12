import { useEffect, useState } from 'react';
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
  const [showFullMessage, setShowFullMessage] = useState(false);

  useEffect(() => {
    setTargetRoleId(suggestion?.targetRoleId ?? '');
    setNote(suggestion?.draftMessage ?? '');
    setShowFullMessage(false);
  }, [suggestion]);

  const currentRole = task.roles.find((r) => r.id === currentRoleId);
  const otherRoles = task.roles.filter((r) => r.id !== currentRoleId);

  const latestAssistantMessage = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant');

  const fullMessage = suggestion?.fullMessage || latestAssistantMessage?.content || '';

  const handleForward = async () => {
    if (!targetRoleId) {
      alert('请选择接手人员');
      return;
    }

    const trimmedFullMessage = fullMessage.trim();
    if (!trimmedFullMessage) {
      alert('没有可转发的上一条回复');
      return;
    }

    const trimmedNote = note.trim();
    const forwardMessage = trimmedNote
      ? `请接手工作\n\n[Note from user]\n${trimmedNote}\n\n前一个角色的最后一条信息是：\n---\n${trimmedFullMessage}\n---`
      : `请接手工作\n\n前一个角色的最后一条信息是：\n---\n${trimmedFullMessage}\n---`;

    console.log('[ForwardLatestReplyModal] Prepared forward payload', {
      targetRoleId,
      hasNote: Boolean(trimmedNote),
      fullMessageLength: trimmedFullMessage.length,
      payloadLength: forwardMessage.length,
      preview: forwardMessage.slice(0, 200),
    });

    setIsForwarding(true);
    try {
      await onForward(targetRoleId, forwardMessage);
    } finally {
      setIsForwarding(false);
    }
  };

  const isConfirmDisabled =
    isForwarding || !targetRoleId || !latestAssistantMessage || otherRoles.length === 0;

  return (
    <div className="modal-overlay">
      <div className="forward-modal">
        <div className="forward-modal-header">
          <h3 className="forward-modal-title">
            🔄 工作交接
          </h3>
          <p className="forward-modal-subtitle">
            <strong>{currentRole?.name}</strong> 完成了当前工作，请选择接手人员继续处理
          </p>
        </div>

        <div className="forward-modal-body">
          {suggestion && suggestion.recommended && (
            <div className="forward-ai-recommendation">
              <div className="forward-ai-recommendation-label">
                💡 AI 推荐
              </div>
              <div className="forward-ai-recommendation-name">
                {suggestion.targetRoleName ?? '未识别'}
              </div>
              <div className="forward-ai-recommendation-reason">
                {suggestion.reason}
              </div>
            </div>
          )}

          <div className="forward-form-group">
            <label className="forward-form-label">
              选择接手人员 *
            </label>
            {otherRoles.length === 0 ? (
              <div className="forward-no-roles-warning">
                当前任务中没有其他团队成员
              </div>
            ) : (
              <select
                className="forward-select"
                value={targetRoleId}
                onChange={(e) => setTargetRoleId(e.target.value)}
                disabled={isForwarding || !latestAssistantMessage}
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

          <div className="forward-form-group forward-form-group--compact">
            <label className="forward-form-label">
              交接说明（可选）
            </label>
            <textarea
              className="forward-textarea"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="可以添加一些背景信息或具体要求..."
              rows={3}
              disabled={isForwarding || !latestAssistantMessage}
            />
          </div>

          {/* 查看完整消息按钮 */}
          <div className="forward-toggle-container">
            <button
              className="forward-toggle-btn"
              onClick={() => setShowFullMessage(!showFullMessage)}
              disabled={!fullMessage}
              type="button"
            >
              <span className={`forward-toggle-btn-icon${showFullMessage ? ' forward-toggle-btn-icon--expanded' : ''}`}>
                ▶
              </span>
              <span>{showFullMessage ? '隐藏完整消息' : '查看完整消息'}</span>
            </button>

            {/* 完整消息展示区域（可折叠） */}
            {showFullMessage && fullMessage && (
              <div className="forward-full-message">
                {fullMessage}
              </div>
            )}
          </div>
        </div>

        <div className="forward-modal-footer">
          <button
            className="forward-cancel-btn"
            onClick={onCancel}
            disabled={isForwarding}
            type="button"
          >
            取消
          </button>
          <button
            className="forward-confirm-btn"
            onClick={handleForward}
            disabled={isConfirmDisabled}
            type="button"
          >
            {isForwarding ? '⏳ 交接中...' : '✓ 确认交接'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ForwardLatestReplyModal;
