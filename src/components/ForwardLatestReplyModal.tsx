import React, { useState } from 'react';
import { Task, TaskRole, Message } from '../types';
import './ForwardLatestReplyModal.css';

interface ForwardLatestReplyModalProps {
  task: Task;
  currentRoleId: string;
  messages: Message[];
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
  onForward,
  onCancel,
}: ForwardLatestReplyModalProps) {
  const [targetRoleId, setTargetRoleId] = useState('');
  const [note, setNote] = useState('');
  const [isForwarding, setIsForwarding] = useState(false);

  const currentRole = task.roles.find((r) => r.id === currentRoleId);
  const otherRoles = task.roles.filter((r) => r.id !== currentRoleId);

  const latestAssistantMessage = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant');

  const handleForward = async () => {
    if (!targetRoleId) {
      alert('Please select a target role');
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
    <div className="modal-overlay" onClick={onCancel}>
      <div className="forward-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Forward Latest Reply</h3>
          <button className="modal-close" onClick={onCancel}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className="form-field">
            <label>From</label>
            <div className="forward-from">
              {currentRole?.name} ({currentRole ? getRoleArchetypeLabel(currentRole.identity, currentRole.archetype_id) : ''})
            </div>
          </div>

          {latestAssistantMessage ? (
            <div className="form-field">
              <label>Latest AI Reply Preview</label>
              <div className="forward-preview">
                {latestAssistantMessage.content.slice(0, 200)}
                {latestAssistantMessage.content.length > 200 ? '...' : ''}
              </div>
            </div>
          ) : (
            <div className="form-field">
              <div className="no-reply-warning">
                No AI reply available to forward
              </div>
            </div>
          )}

          <div className="form-field">
            <label>To</label>
            {otherRoles.length === 0 ? (
              <div className="no-roles-warning">
                No other roles available in this task
              </div>
            ) : (
              <select
                value={targetRoleId}
                onChange={(e) => setTargetRoleId(e.target.value)}
                disabled={isForwarding || !latestAssistantMessage}
              >
                <option value="">Select target role</option>
                {otherRoles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name} ({getRoleArchetypeLabel(role.identity, role.archetype_id)})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="form-field">
            <label>Note to target role (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add context or instructions..."
              rows={3}
              disabled={isForwarding || !latestAssistantMessage}
            />
          </div>

          {latestAssistantMessage && (
            <div className="form-field">
              <label>What will be sent</label>
              <div className="forward-preview-full">
                {note && (
                  <>
                    <div className="preview-section-label">[Optional Note]</div>
                    <div className="preview-note">{note}</div>
                  </>
                )}
                <div className="preview-section-label">
                  [Forwarded Latest Reply from {currentRole?.name}]
                </div>
                <div className="preview-content">
                  {latestAssistantMessage.content.slice(0, 300)}
                  {latestAssistantMessage.content.length > 300 ? '...' : ''}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="modal-cancel" onClick={onCancel} disabled={isForwarding}>
            Cancel
          </button>
          <button
            className="modal-forward"
            onClick={handleForward}
            disabled={isForwarding || !latestAssistantMessage || otherRoles.length === 0}
          >
            {isForwarding ? 'Forwarding...' : 'Forward'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ForwardLatestReplyModal;
