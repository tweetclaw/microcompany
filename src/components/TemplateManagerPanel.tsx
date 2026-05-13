import { useMemo, useState, useEffect } from 'react';
import {
  listAllTemplateSummaries,
  getSystemTemplate,
  listUserTemplates,
} from '../api/templates';
import type { TemplateSummary, SystemTemplate, UserTemplate } from '../types/template';
import type { ProviderConfig } from '../types/settings';
import EditTemplateModal from './EditTemplateModal';
import './TemplateManagerPanel.css';

interface TemplateManagerPanelProps {
  availableProviders: ProviderConfig[];
  onBack: () => void;
}

function formatTemplateTime(value?: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function TemplateManagerPanel({ availableProviders, onBack }: TemplateManagerPanelProps) {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<SystemTemplate | UserTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'system' | 'user'>('all');

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      console.log('[TemplateManagerPanel] Loading template summaries');
      setLoading(true);
      setError(null);
      const data = await listAllTemplateSummaries();
      console.log('[TemplateManagerPanel] Template summaries loaded', {
        total: data.length,
        systemCount: data.filter((item) => item.source === 'system').length,
        userCount: data.filter((item) => item.source === 'user').length,
      });
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
      console.log('[TemplateManagerPanel] Opening template detail', {
        templateId: template.id,
        templateName: template.name,
        source: template.source,
      });
      setLoadingDetailId(template.id);
      setError(null);
      setSuccessMessage(null);
      let detail: SystemTemplate | UserTemplate | null = null;

      if (template.source === 'system') {
        detail = await getSystemTemplate(template.id);
      } else {
        const userTemplates = await listUserTemplates();
        detail = userTemplates.find((t) => t.id === template.id) ?? null;
      }

      if (!detail) {
        console.warn('[TemplateManagerPanel] Template detail not found after fetch', {
          templateId: template.id,
          source: template.source,
        });
        setError('无法加载模板详情');
        return;
      }

      console.log('[TemplateManagerPanel] Template detail loaded', {
        templateId: detail.id,
        templateName: detail.name,
        roleCount: detail.roles.length,
      });
      setEditingTemplate(detail);
    } catch (err) {
      console.error('[TemplateManagerPanel] Failed to load template detail:', err);
      setError('加载模板详情失败');
    } finally {
      setLoadingDetailId(null);
    }
  };

  const handleTemplateSaved = async (savedTemplate?: UserTemplate) => {
    console.log('[TemplateManagerPanel] Template save callback received', {
      savedTemplateId: savedTemplate?.id ?? null,
      savedTemplateName: savedTemplate?.name ?? null,
      wasEditingSystemTemplate: Boolean(editingTemplate && 'category' in editingTemplate),
    });
    await loadTemplates();

    if (!savedTemplate) {
      setEditingTemplate(null);
      setSuccessMessage('模板已保存');
      return;
    }

    setEditingTemplate(savedTemplate);
    setSuccessMessage(
      editingTemplate && 'category' in editingTemplate
        ? '已复制为自定义模板，你现在可以继续编辑副本'
        : '模板已保存'
    );
  };

  const handleTemplateDeleted = async (deletedTemplateId?: string) => {
    console.log('[TemplateManagerPanel] Template delete callback received', {
      deletedTemplateId: deletedTemplateId ?? null,
    });
    setEditingTemplate(null);
    setSuccessMessage(null);
    setError(null);

    try {
      await loadTemplates();
      setSuccessMessage('模板已删除');
    } catch (err) {
      console.error('[TemplateManagerPanel] Failed to refresh templates after delete:', err);
      setError('删除模板后刷新列表失败');
    }
  };

  const filteredTemplates = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return templates.filter((template) => {
      if (sourceFilter !== 'all' && template.source !== sourceFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystacks = [
        template.name,
        template.description,
        template.category ?? '',
        ...(template.tags ?? []),
      ]
        .join(' ')
        .toLowerCase();

      return haystacks.includes(normalizedQuery);
    });
  }, [templates, searchQuery, sourceFilter]);

  const systemTemplates = filteredTemplates.filter((t) => t.source === 'system');
  const userTemplates = filteredTemplates.filter((t) => t.source === 'user');

  return (
    <div className="template-manager-panel">
      <div className="template-manager-header">
        <button className="template-manager-back-btn" onClick={onBack} title="返回任务列表">
          ← 返回
        </button>
        <span className="template-manager-title">管理模板</span>
      </div>

      <div className="template-manager-list">
        <div className="template-manager-toolbar">
          <input
            className="template-manager-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索模板名称、描述、标签..."
          />
          <select
            className="template-manager-filter"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as 'all' | 'system' | 'user')}
          >
            <option value="all">全部模板</option>
            <option value="system">仅系统模板</option>
            <option value="user">仅自定义模板</option>
          </select>
        </div>

        {(searchQuery || sourceFilter !== 'all') && (
          <div className="template-manager-filter-summary">
            共匹配 {filteredTemplates.length} 个模板
          </div>
        )}

        {error && (
          <div className="template-manager-error">{error}</div>
        )}

        {successMessage && (
          <div className="template-manager-success">{successMessage}</div>
        )}

        {loading ? (
          <div className="template-manager-loading">加载中...</div>
        ) : filteredTemplates.length === 0 ? (
          <div className="template-manager-empty">
            {templates.length === 0 ? '暂无模板' : '没有符合当前筛选条件的模板'}
          </div>
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
          onSaved={handleTemplateSaved}
          onDeleted={handleTemplateDeleted}
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
  const isSystemTemplate = template.source === 'system';
  const formattedUpdatedAt = formatTemplateTime(template.updated_at);
  const formattedCreatedAt = formatTemplateTime(template.created_at);

  return (
    <div
      className={`template-manager-item ${isLoading ? 'loading' : ''}`}
      onClick={isLoading ? undefined : onClick}
      title={template.description || template.name}
    >
      <div className="template-manager-item-icon">
        {template.icon || (isSystemTemplate ? '🏛️' : '📄')}
      </div>
      <div className="template-manager-item-content">
        <div className="template-manager-item-topline">
          <div className="template-manager-item-name">{template.name}</div>
          <div className="template-manager-item-badges">
            <span className={`template-manager-badge ${isSystemTemplate ? 'system' : 'user'}`}>
              {isSystemTemplate ? '系统' : '自定义'}
            </span>
            {template.category && (
              <span className="template-manager-badge neutral">{template.category}</span>
            )}
          </div>
        </div>

        {template.description && (
          <div className="template-manager-item-description">{template.description}</div>
        )}

        <div className="template-manager-item-meta">
          <span>{template.role_count} 个角色</span>
          <span>{isSystemTemplate ? '系统只读，可复制' : '可编辑'}</span>
          {formattedUpdatedAt && <span>更新于 {formattedUpdatedAt}</span>}
          {!formattedUpdatedAt && formattedCreatedAt && <span>创建于 {formattedCreatedAt}</span>}
        </div>

        {template.tags.length > 0 && (
          <div className="template-manager-tags">
            {template.tags.slice(0, 4).map((tag) => (
              <span key={tag} className="template-manager-tag">
                #{tag}
              </span>
            ))}
            {template.tags.length > 4 && (
              <span className="template-manager-tag template-manager-tag-more">
                +{template.tags.length - 4}
              </span>
            )}
          </div>
        )}
      </div>
      <span className="template-manager-item-action">
        {isLoading ? '⏳' : isSystemTemplate ? '📋' : '✏️'}
      </span>
    </div>
  );
}
