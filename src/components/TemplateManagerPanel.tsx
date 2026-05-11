import { useState, useEffect } from 'react';
import { listAllTemplateSummaries, getSystemTemplate, listUserTemplates } from '../api/templates';
import type { TemplateSummary, SystemTemplate, UserTemplate } from '../types/template';
import type { ProviderConfig } from '../types/settings';
import EditTemplateModal from './EditTemplateModal';
import './TemplateManagerPanel.css';

interface TemplateManagerPanelProps {
  availableProviders: ProviderConfig[];
  onBack: () => void;
}

export default function TemplateManagerPanel({ availableProviders, onBack }: TemplateManagerPanelProps) {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<SystemTemplate | UserTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listAllTemplateSummaries();
      setTemplates(data);
    } catch (err) {
      console.error('[TemplateManagerPanel] Failed to load templates:', err);
      setError('加载模板失败');
    } finally {
      setLoading(false);
    }
  };

  const handleEditTemplate = async (template: TemplateSummary) => {
    try {
      setLoadingDetailId(template.id);
      setError(null);
      let detail: SystemTemplate | UserTemplate | null = null;

      if (template.source === 'system') {
        detail = await getSystemTemplate(template.id);
      } else {
        const userTemplates = await listUserTemplates();
        detail = userTemplates.find((t) => t.id === template.id) ?? null;
      }

      if (!detail) {
        setError('无法加载模板详情');
        return;
      }

      setEditingTemplate(detail);
    } catch (err) {
      console.error('[TemplateManagerPanel] Failed to load template detail:', err);
      setError('加载模板详情失败');
    } finally {
      setLoadingDetailId(null);
    }
  };

  const systemTemplates = templates.filter((t) => t.source === 'system');
  const userTemplates = templates.filter((t) => t.source === 'user');

  return (
    <div className="template-manager-panel">
      <div className="template-manager-header">
        <button className="template-manager-back-btn" onClick={onBack} title="返回任务列表">
          ← 返回
        </button>
        <span className="template-manager-title">管理模板</span>
      </div>

      <div className="template-manager-list">
        {error && (
          <div className="template-manager-error">{error}</div>
        )}

        {loading ? (
          <div className="template-manager-loading">加载中...</div>
        ) : templates.length === 0 ? (
          <div className="template-manager-empty">暂无模板</div>
        ) : (
          <>
            {systemTemplates.length > 0 && (
              <div className="template-manager-section">
                <div className="template-manager-section-label">内置模板</div>
                {systemTemplates.map((template) => (
                  <TemplateItem
                    key={template.id}
                    template={template}
                    isLoading={loadingDetailId === template.id}
                    onClick={() => handleEditTemplate(template)}
                  />
                ))}
              </div>
            )}

            {userTemplates.length > 0 && (
              <div className="template-manager-section">
                <div className="template-manager-section-label">自定义模板</div>
                {userTemplates.map((template) => (
                  <TemplateItem
                    key={template.id}
                    template={template}
                    isLoading={loadingDetailId === template.id}
                    onClick={() => handleEditTemplate(template)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {editingTemplate && (
        <EditTemplateModal
          template={editingTemplate}
          availableProviders={availableProviders}
          onClose={() => setEditingTemplate(null)}
          onSaved={() => {
            setEditingTemplate(null);
            loadTemplates();
          }}
        />
      )}
    </div>
  );
}

interface TemplateItemProps {
  template: TemplateSummary;
  isLoading: boolean;
  onClick: () => void;
}

function TemplateItem({ template, isLoading, onClick }: TemplateItemProps) {
  return (
    <div
      className={`template-manager-item ${isLoading ? 'loading' : ''}`}
      onClick={isLoading ? undefined : onClick}
      title={template.description || template.name}
    >
      <div className="template-manager-item-icon">
        {template.source === 'system' ? '🏛️' : '📄'}
      </div>
      <div className="template-manager-item-content">
        <div className="template-manager-item-name">{template.name}</div>
        <div className="template-manager-item-meta">
          {template.role_count} 个角色
        </div>
      </div>
      <span className="template-manager-item-action">
        {isLoading ? '⏳' : '✏️'}
      </span>
    </div>
  );
}
