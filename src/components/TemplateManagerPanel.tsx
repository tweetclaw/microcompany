import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import EditTemplateModal from './EditTemplateModal';
import { getSystemTemplate, listAllTemplateSummaries, listUserTemplates } from '../api/templates';
import { normalizeSettingsData, isProviderUsable } from '../types/settings';
import type { ProviderConfig, SettingsData } from '../types/settings';
import type { SystemTemplate, TemplateSummary, UserTemplate } from '../types/template';
import './TemplateManagerPanel.css';

interface TemplateManagerPanelProps {
  onTemplateSelected?: (template: SystemTemplate | UserTemplate) => void;
}

function formatTemplateTime(template: TemplateSummary) {
  const value = template.updated_at ?? template.created_at;
  if (!value) {
    return '暂无更新时间';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return template.updated_at ? '更新于 --' : '创建于 --';
  }

  const label = template.updated_at ? '更新于' : '创建于';
  return `${label} ${date.toLocaleDateString('zh-CN')}`;
}

function isSystemTemplate(template: SystemTemplate | UserTemplate): template is SystemTemplate {
  return 'category' in template;
}

export default function TemplateManagerPanel({ onTemplateSelected }: TemplateManagerPanelProps) {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [availableProviders, setAvailableProviders] = useState<ProviderConfig[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<SystemTemplate | UserTemplate | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'system' | 'user'>('all');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadTemplateSummaries = async (preferredTemplateId?: string | null) => {
    try {
      setLoading(true);
      setError(null);
      const items = await listAllTemplateSummaries();
      setTemplates(items);

      setSelectedTemplateId((current) => {
        if (preferredTemplateId && items.some((item) => item.id === preferredTemplateId)) {
          return preferredTemplateId;
        }
        if (current && items.some((item) => item.id === current)) {
          return current;
        }
        return items[0]?.id ?? null;
      });
    } catch (err) {
      console.error('[TemplateManagerPanel] Failed to load template summaries:', err);
      setError('加载模板列表失败');
      setTemplates([]);
      setSelectedTemplateId(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplateSummaries();
    invoke('get_config')
      .then((raw) => normalizeSettingsData(raw))
      .then((settings: SettingsData) => {
        setAvailableProviders((settings.providers ?? []).filter((provider) => isProviderUsable(provider)));
      })
      .catch((err: unknown) => {
        console.error('[TemplateManagerPanel] Failed to load providers:', err);
        setAvailableProviders([]);
      });
  }, []);

  const filteredTemplates = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    return templates.filter((template) => {
      if (sourceFilter !== 'all' && template.source !== sourceFilter) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      return [template.name, template.description, template.category ?? '', ...(template.tags ?? [])]
        .join(' ')
        .toLowerCase()
        .includes(keyword);
    });
  }, [templates, searchQuery, sourceFilter]);

  useEffect(() => {
    if (!filteredTemplates.length) {
      setSelectedTemplateId(null);
      return;
    }

    if (!selectedTemplateId || !filteredTemplates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(filteredTemplates[0].id);
    }
  }, [filteredTemplates, selectedTemplateId]);

  useEffect(() => {
    if (!selectedTemplateId) {
      setSelectedTemplate(null);
      setDetailError(null);
      return;
    }

    let cancelled = false;
    const summary = templates.find((item) => item.id === selectedTemplateId);
    if (!summary) {
      setSelectedTemplate(null);
      return;
    }

    setDetailLoading(true);
    setDetailError(null);

    const loadDetail = async () => {
      try {
        let detail: SystemTemplate | UserTemplate | null = null;
        if (summary.source === 'system') {
          detail = await getSystemTemplate(summary.id);
        } else {
          const users = await listUserTemplates();
          detail = users.find((template) => template.id === summary.id) ?? null;
        }

        if (cancelled) {
          return;
        }

        if (!detail) {
          setSelectedTemplate(null);
          setDetailError('模板详情不存在或已被删除');
          return;
        }

        setSelectedTemplate(detail);
        onTemplateSelected?.(detail);
      } catch (err) {
        console.error('[TemplateManagerPanel] Failed to load template detail:', err);
        if (!cancelled) {
          setSelectedTemplate(null);
          setDetailError('加载模板详情失败');
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    };

    loadDetail();

    return () => {
      cancelled = true;
    };
  }, [selectedTemplateId, templates, onTemplateSelected]);

  const handleSaved = async (savedTemplate?: UserTemplate) => {
    if (savedTemplate) {
      const duplicatedFromSystem = selectedTemplate ? isSystemTemplate(selectedTemplate) && savedTemplate.id !== selectedTemplate.id : false;
      setSuccessMessage(duplicatedFromSystem ? '已复制为自定义模板，你现在可以继续编辑副本' : '模板已保存');
      setSelectedTemplate(savedTemplate);
      setSelectedTemplateId(savedTemplate.id);
      await loadTemplateSummaries(savedTemplate.id);
      return;
    }

    setSuccessMessage('模板已保存');
    await loadTemplateSummaries(selectedTemplate?.id ?? selectedTemplateId);
  };

  const handleDeleted = async (templateId: string) => {
    setSuccessMessage('模板已删除');
    setSelectedTemplate(null);
    setSelectedTemplateId((current) => (current === templateId ? null : current));
    await loadTemplateSummaries();
  };

  const selectedSummary = filteredTemplates.find((template) => template.id === selectedTemplateId) ?? null;

  return (
    <div className="template-manager-panel template-manager-panel-embedded">
      <div className="template-manager-sidebar">
        <div className="template-manager-sidebar-header">
          <div>
            <h2>任务模板</h2>
            <p>左侧选择模板，中间直接查看和编辑详情。</p>
          </div>
        </div>

        <div className="template-manager-toolbar">
          <input
            className="template-manager-search"
            placeholder="搜索模板名称、描述、标签"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <select
            className="template-manager-filter"
            value={sourceFilter}
            onChange={(event) => setSourceFilter(event.target.value as 'all' | 'system' | 'user')}
          >
            <option value="all">全部模板</option>
            <option value="system">系统模板</option>
            <option value="user">自定义模板</option>
          </select>
        </div>

        {successMessage ? <div className="template-manager-success">{successMessage}</div> : null}
        {error ? <div className="template-manager-error">{error}</div> : null}

        <div className="template-manager-summary-line">
          {loading ? '模板加载中…' : `共匹配 ${filteredTemplates.length} 个模板`}
        </div>

        <div className="template-manager-list" role="list">
          {!loading && filteredTemplates.length === 0 ? (
            <div className="template-manager-empty">没有符合当前筛选条件的模板</div>
          ) : null}

          {filteredTemplates.map((template) => (
            <button
              key={template.id}
              type="button"
              className={`template-manager-list-item ${selectedSummary?.id === template.id ? 'selected' : ''}`}
              onClick={() => {
                setSuccessMessage(null);
                setSelectedTemplateId(template.id);
              }}
            >
              <div className="template-manager-list-item-main">
                <div className="template-manager-list-item-top-row">
                  <div className="template-manager-list-item-title-group">
                    <span className="template-manager-list-item-icon">{template.icon || (template.source === 'system' ? '🧩' : '📝')}</span>
                    <span className="template-manager-list-item-title">{template.name}</span>
                  </div>
                  <span className={`template-manager-source-badge ${template.source}`}>{template.source === 'system' ? '系统' : '自定义'}</span>
                </div>

                {template.description ? (
                  <div className="template-manager-list-item-description">{template.description}</div>
                ) : null}

                <div className="template-manager-list-item-meta">
                  {template.category ? <span className="template-manager-category-badge">{template.category}</span> : null}
                  <span>{template.role_count} 个角色</span>
                  <span>{formatTemplateTime(template)}</span>
                </div>

                {template.tags?.length ? (
                  <div className="template-manager-tag-row">
                    {template.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="template-manager-tag">
                        {tag}
                      </span>
                    ))}
                    {template.tags.length > 3 ? <span className="template-manager-tag">+{template.tags.length - 3}</span> : null}
                  </div>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="template-manager-detail-panel">
        {detailLoading ? <div className="template-manager-detail-placeholder">模板详情加载中…</div> : null}
        {!detailLoading && detailError ? <div className="template-manager-detail-placeholder error">{detailError}</div> : null}
        {!detailLoading && !detailError && selectedTemplate ? (
          <div className="template-manager-detail-card">
            <EditTemplateModal
              template={selectedTemplate}
              availableProviders={availableProviders}
              onClose={() => {}}
              onSaved={handleSaved}
              onDeleted={handleDeleted}
              embedded
              allowSystemTemplateEditing
            />
          </div>
        ) : null}
        {!detailLoading && !detailError && !selectedTemplate ? (
          <div className="template-manager-detail-placeholder">请选择一个模板查看详情</div>
        ) : null}
      </div>
    </div>
  );
}
