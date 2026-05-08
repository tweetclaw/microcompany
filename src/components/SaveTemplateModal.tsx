import { useState } from 'react';
import './SaveTemplateModal.css';

interface SaveTemplateModalProps {
  taskName: string;
  onSave: (name: string, description: string) => void;
  onCancel: () => void;
}

export default function SaveTemplateModal({
  taskName,
  onSave,
  onCancel,
}: SaveTemplateModalProps) {
  const [templateName, setTemplateName] = useState(taskName);
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const handleSave = () => {
    const trimmedName = templateName.trim();
    if (!trimmedName) {
      setError('模板名称不能为空');
      return;
    }

    onSave(trimmedName, description.trim());
  };

  return (
    <div className="save-template-modal-overlay" onClick={onCancel}>
      <div className="save-template-modal" onClick={(e) => e.stopPropagation()}>
        <div className="save-template-modal-header">
          <h2>保存为模板</h2>
          <button
            type="button"
            className="save-template-modal-close"
            onClick={onCancel}
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <div className="save-template-modal-body">
          <p className="save-template-modal-description">
            将当前任务的团队结构保存为模板，以便在创建新任务时快速复用。
          </p>

          <div className="save-template-modal-field">
            <label htmlFor="template-name">
              模板名称 <span className="save-template-modal-required">*</span>
            </label>
            <input
              id="template-name"
              type="text"
              value={templateName}
              onChange={(e) => {
                setTemplateName(e.target.value);
                setError('');
              }}
              placeholder="例如：前端开发团队"
              autoFocus
            />
            {error && <div className="save-template-modal-error">{error}</div>}
          </div>

          <div className="save-template-modal-field">
            <label htmlFor="template-description">描述（可选）</label>
            <textarea
              id="template-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="描述这个模板的用途和适用场景"
              rows={3}
            />
          </div>
        </div>

        <div className="save-template-modal-footer">
          <button
            type="button"
            className="save-template-modal-button save-template-modal-button-secondary"
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="button"
            className="save-template-modal-button save-template-modal-button-primary"
            onClick={handleSave}
          >
            保存模板
          </button>
        </div>
      </div>
    </div>
  );
}
