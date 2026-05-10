import { useState, useEffect } from 'react';
import { listAllTemplateSummaries, getSystemTemplate, listUserTemplates, isTemplateComplete } from '../api/templates';
import type { TemplateSummary, SystemTemplate, UserTemplate } from '../types/template';
import type { ProviderConfig } from '../types/settings';
import EditTemplateModal from './EditTemplateModal';
import './TemplatePicker.css';

interface TemplatePickerProps {
  onSelectTemplate: (template: SystemTemplate | UserTemplate | TemplateSummary) => void;
  onCreateBlank: () => void;
  onCancel: () => void;
  availableProviders: ProviderConfig[];
}

export default function TemplatePicker({ onSelectTemplate, onCreateBlank, onCancel, availableProviders }: TemplatePickerProps) {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<SystemTemplate | UserTemplate | TemplateSummary | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SystemTemplate | UserTemplate | null>(null);
  const [fullTemplates, setFullTemplates] = useState<Map<string, SystemTemplate | UserTemplate>>(new Map());

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadFullTemplates = async (summaries?: TemplateSummary[]) => {
    try {
      const templateSummaries = summaries ?? await listAllTemplateSummaries();
      const systemIds = templateSummaries.filter((t) => t.source === 'system');
      const [systemDetails, userDetails] = await Promise.all([
        Promise.all(systemIds.map(async (t) => [t.id, await getSystemTemplate(t.id)] as const)),
        listUserTemplates(),
      ]);

      const next = new Map<string, SystemTemplate | UserTemplate>();
      systemDetails.forEach(([id, detail]) => {
        if (detail) next.set(id, detail);
      });
      userDetails.forEach((detail) => {
        next.set(detail.id, detail);
      });

      setFullTemplates(next);
      return next;
    } catch (err) {
      console.error('[TemplatePicker] Failed to preload full templates:', err);
      return new Map<string, SystemTemplate | UserTemplate>();
    }
  };

  const loadTemplates = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await listAllTemplateSummaries();
      setTemplates(data);
      await loadFullTemplates(data);
    } catch (err) {
      console.error('Failed to load templates:', err);
      setError('Failed to load templates. Using mock data for preview.');
      setTemplates(getMockTemplates());
    } finally {
      setLoading(false);
    }
  };

  const handleTemplateClick = async (template: TemplateSummary) => {
    setSelectedId(template.id);
    if (template.source === 'system') {
      try {
        const detail = await getSystemTemplate(template.id);
        if (detail) {
          setSelectedTemplate(detail);
        } else {
          setSelectedTemplate(template);
        }
      } catch {
        setSelectedTemplate(template);
      }
    } else {
      const fullTemplate = fullTemplates.get(template.id);
      setSelectedTemplate(fullTemplate ?? template);
    }
  };

  const handleBlankClick = () => {
    setSelectedId('blank');
    setSelectedTemplate(null);
  };

  const handleEditTemplate = async (e: React.MouseEvent, template: TemplateSummary) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('[TemplatePicker] handleEditTemplate: Opening edit modal for template:', template.id);

    try {
      let detail: SystemTemplate | UserTemplate | null = null;
      if (template.source === 'system') {
        detail = await getSystemTemplate(template.id);
      } else {
        const userTemplates = await listUserTemplates();
        detail = userTemplates.find((t) => t.id === template.id) ?? null;
      }

      if (!detail) {
        console.warn('[TemplatePicker] handleEditTemplate: Template detail not found:', template.id);
        setError('Failed to load template details');
        return;
      }

      console.log('[TemplatePicker] handleEditTemplate: Detail loaded, opening modal:', detail.id);
      setEditingTemplate(detail);
      setShowEditModal(true);
    } catch (err) {
      console.error('[TemplatePicker] handleEditTemplate: Failed to load template:', err);
      setError('Failed to open template editor');
    }
  };

  const handleEditSaved = async () => {
    console.log('[TemplatePicker] handleEditSaved: Template saved, reloading templates');
    setShowEditModal(false);
    setEditingTemplate(null);

    try {
      const data = await listAllTemplateSummaries();
      setTemplates(data);
      const fullMap = await loadFullTemplates(data);

      if (selectedId && selectedId !== 'blank') {
        const selectedSummary = data.find((item) => item.id === selectedId) ?? null;
        if (selectedSummary?.source === 'system') {
          const detail = await getSystemTemplate(selectedSummary.id);
          setSelectedTemplate(detail ?? selectedSummary);
        } else if (selectedSummary) {
          setSelectedTemplate(fullMap.get(selectedSummary.id) ?? selectedSummary);
        }
      }
    } catch (err) {
      console.error('[TemplatePicker] handleEditSaved: Failed to reload templates after save:', err);
      setError('Template saved, but failed to refresh the list. Please reopen the picker.');
    }
  };

  const getTemplateStatus = (template: TemplateSummary): 'complete' | 'incomplete' => {
    const fullTemplate = fullTemplates.get(template.id);
    if (!fullTemplate) {
      return 'incomplete';
    }
    return isTemplateComplete(fullTemplate) ? 'complete' : 'incomplete';
  };

  const handleCreateTask = () => {
    if (selectedId === 'blank') {
      onCreateBlank();
    } else if (selectedTemplate) {
      onSelectTemplate(selectedTemplate);
    }
  };

  const systemTemplates = templates.filter((t) => t.source === 'system');
  const userTemplates = templates.filter((t) => t.source === 'user');

  if (loading) {
    return (
      <div className="template-picker">
        <div className="template-picker-loading">Loading templates...</div>
      </div>
    );
  }

  if (error && templates.length === 0) {
    return (
      <div className="template-picker">
        <div className="template-picker-error">
          <p>{error}</p>
          <button className="template-picker-retry-btn" onClick={loadTemplates}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="template-picker">
      <div className="template-picker-header">
        <button className="template-picker-back" onClick={onCancel}>
          ✕ Close
        </button>
        <h3>Create New Task</h3>
        <p>Choose a template or start from scratch</p>
      </div>

      <div className="template-picker-content">
        <div className="template-section">
          <h3 className="template-section-title">Templates</h3>
          <div className="template-picker-grid">
            <div
              className={`template-card blank-card ${selectedId === 'blank' ? 'selected' : ''}`}
              onClick={handleBlankClick}
            >
              <div className="template-card-blank-icon">➕</div>
              <div className="template-card-content">
                <div className="template-card-name">Blank Task</div>
                <div className="template-card-desc">Start from scratch</div>
              </div>
            </div>

            {systemTemplates.map((tpl) => {
              const status = getTemplateStatus(tpl);
              return (
                <div
                  key={tpl.id}
                  className={`template-card ${selectedId === tpl.id ? 'selected' : ''} ${status === 'incomplete' ? 'incomplete' : 'complete'}`}
                  onClick={() => handleTemplateClick(tpl)}
                >
                  <div className="template-card-status-badge" title={status === 'complete' ? 'Ready' : 'Provider required'}>
                    {status === 'complete' ? '✅' : '⚠️'}
                  </div>
                  <div className="template-card-icon">{tpl.icon || '📋'}</div>
                  <div className="template-card-content">
                    <div className="template-card-name">{tpl.name}</div>
                    <div className="template-card-desc">{tpl.description}</div>
                    <div className="template-card-meta">
                      <span className="template-card-source system">System</span>
                      <span className="template-card-role-count">{tpl.role_count} roles</span>
                      {tpl.tags && tpl.tags.map((tag) => (
                        <span key={tag} className="template-card-tag">{tag}</span>
                      ))}
                    </div>
                    {status === 'incomplete' && (
                      <div className="template-card-warning">
                        AI Provider required before use
                      </div>
                    )}
                  </div>
                  <div className="template-card-actions">
                    <button
                      type="button"
                      className="template-card-edit-btn"
                      onClick={(e) => handleEditTemplate(e, tpl)}
                      title="Edit template"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {userTemplates.length > 0 && (
          <div className="template-section">
            <h3 className="template-section-title">Your Templates</h3>
            <div className="template-picker-grid">
              {userTemplates.map((tpl) => {
                const status = getTemplateStatus(tpl);
                return (
                  <div
                    key={tpl.id}
                    className={`template-card ${selectedId === tpl.id ? 'selected' : ''} ${status === 'incomplete' ? 'incomplete' : 'complete'}`}
                    onClick={() => handleTemplateClick(tpl)}
                  >
                    <div className="template-card-status-badge" title={status === 'complete' ? 'Ready' : 'Provider required'}>
                      {status === 'complete' ? '✅' : '⚠️'}
                    </div>
                    <div className="template-card-icon">{tpl.icon || '📋'}</div>
                    <div className="template-card-content">
                      <div className="template-card-name">{tpl.name}</div>
                      <div className="template-card-desc">{tpl.description}</div>
                      <div className="template-card-meta">
                        <span className="template-card-source user">User</span>
                        <span className="template-card-role-count">{tpl.role_count} roles</span>
                        {tpl.tags && tpl.tags.map((tag) => (
                          <span key={tag} className="template-card-tag">{tag}</span>
                        ))}
                      </div>
                      {status === 'incomplete' && (
                        <div className="template-card-warning">
                          AI Provider required before use
                        </div>
                      )}
                    </div>
                    <div className="template-card-actions">
                      <button
                        type="button"
                        className="template-card-edit-btn"
                        onClick={(e) => handleEditTemplate(e, tpl)}
                        title="Edit template"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="template-picker-footer">
        <button
          className="template-picker-create-btn"
          onClick={handleCreateTask}
          disabled={!selectedId}
        >
          {selectedId === 'blank' ? 'Create Blank Task' : 'Continue with Template'}
        </button>
      </div>

      {showEditModal && editingTemplate && (
        <EditTemplateModal
          template={editingTemplate}
          availableProviders={availableProviders}
          onClose={() => {
            setShowEditModal(false);
            setEditingTemplate(null);
          }}
          onSaved={handleEditSaved}
        />
      )}
    </div>
  );
}

function getMockTemplates(): TemplateSummary[] {
  return [
    {
      id: 'mock-system-1',
      name: 'Full-Stack Feature Team',
      description: 'Product Manager + Frontend + Backend + QA team setup',
      icon: '🚀',
      source: 'system',
      role_count: 4,
      tags: ['full-stack', 'agile'],
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
    {
      id: 'mock-system-2',
      name: 'Solo Developer',
      description: 'Single full-stack developer with AI pair programming',
      icon: '💻',
      source: 'system',
      role_count: 1,
      tags: ['solo', 'quick'],
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
    {
      id: 'mock-system-3',
      name: 'Code Review Squad',
      description: 'Reviewer + Security Auditor + Performance Analyst',
      icon: '🔍',
      source: 'system',
      role_count: 3,
      tags: ['review', 'quality'],
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
  ];
}
