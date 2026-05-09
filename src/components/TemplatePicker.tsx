import { useState, useEffect } from 'react';
import { listAllTemplateSummaries, getSystemTemplate, isTemplateComplete } from '../api/templates';
import type { TemplateSummary, SystemTemplate, UserTemplate } from '../types/template';
import type { ProviderConfig } from '../types/settings';
import EditTemplateModal from './EditTemplateModal';
import './TemplatePicker.css';

interface TemplatePickerProps {
  onSelectTemplate: (template: SystemTemplate | TemplateSummary) => void;
  onCreateBlank: () => void;
  onCancel: () => void;
  availableProviders: ProviderConfig[];
}

export default function TemplatePicker({ onSelectTemplate, onCreateBlank, onCancel, availableProviders }: TemplatePickerProps) {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<SystemTemplate | TemplateSummary | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailTemplate, setDetailTemplate] = useState<SystemTemplate | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SystemTemplate | UserTemplate | null>(null);
  const [fullTemplates, setFullTemplates] = useState<Map<string, SystemTemplate | UserTemplate>>(new Map());

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
      console.error('Failed to load templates:', err);
      setError('Failed to load templates. Using mock data for preview.');
      // Mock fallback data for offline development
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
      setSelectedTemplate(template);
    }
  };

  const handleBlankClick = () => {
    setSelectedId('blank');
    setSelectedTemplate(null);
  };

  const handleShowDetail = async (e: React.MouseEvent, template: TemplateSummary) => {
    e.stopPropagation();
    try {
      setLoadingDetail(true);
      const detail = await getSystemTemplate(template.id);
      if (detail) {
        setDetailTemplate(detail);
        setShowDetailModal(true);
      }
    } catch (err) {
      console.error('Failed to load template detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleEditTemplate = async (e: React.MouseEvent, template: TemplateSummary) => {
    e.stopPropagation();
    console.log('[TemplatePicker] handleEditTemplate: Opening edit modal for template:', template.id);
    
    try {
      const detail = await getSystemTemplate(template.id);
      if (detail) {
        setEditingTemplate(detail);
        setShowEditModal(true);
      }
    } catch (err) {
      console.error('[TemplatePicker] handleEditTemplate: Failed to load template:', err);
    }
  };

  const handleEditSaved = () => {
    console.log('[TemplatePicker] handleEditSaved: Template saved, reloading templates');
    setShowEditModal(false);
    setEditingTemplate(null);
    loadTemplates();
  };

  const getTemplateStatus = (template: TemplateSummary): 'complete' | 'incomplete' => {
    const fullTemplate = fullTemplates.get(template.id);
    if (!fullTemplate) {
      // If we don't have the full template loaded, assume incomplete for user templates
      return template.source === 'user' ? 'incomplete' : 'complete';
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
        {/* System Templates with Blank Card as first item */}
        <div className="template-section">
          <h3 className="template-section-title">Templates</h3>
          <div className="template-picker-grid">
            {/* Blank Creation Card - First in grid */}
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

            {/* System Templates */}
            {systemTemplates.map((tpl) => {
              const status = getTemplateStatus(tpl);
              return (
                <div
                  key={tpl.id}
                  className={`template-card ${selectedId === tpl.id ? 'selected' : ''} ${status === 'incomplete' ? 'incomplete' : 'complete'}`}
                  onClick={() => handleTemplateClick(tpl)}
                >
                  <div className="template-card-status-badge">
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
                        ⚠️ Needs AI Provider configuration
                      </div>
                    )}
                  </div>
                  <button 
                    className="template-card-detail-btn"
                    onClick={(e) => handleShowDetail(e, tpl)}
                    disabled={loadingDetail}
                  >
                    ℹ️ Details
                  </button>
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
                    <div className="template-card-status-badge">
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
                          ⚠️ Needs AI Provider configuration
                        </div>
                      )}
                    </div>
                    <div className="template-card-actions">
                      <button 
                        className="template-card-edit-btn"
                        onClick={(e) => handleEditTemplate(e, tpl)}
                        title="Edit template"
                      >
                        ✏️ Edit
                      </button>
                      <button 
                        className="template-card-detail-btn"
                        onClick={(e) => handleShowDetail(e, tpl)}
                        disabled={loadingDetail}
                      >
                        ℹ️ Details
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Create Task Button */}
      <div className="template-picker-footer">
        <button 
          className="template-picker-create-btn"
          onClick={handleCreateTask}
          disabled={!selectedId}
        >
          {selectedId === 'blank' ? 'Create Blank Task' : 'Continue with Template'}
        </button>
      </div>

      {/* Detail Modal */}
      {showDetailModal && detailTemplate && (
        <div className="template-detail-modal-overlay" onClick={() => setShowDetailModal(false)}>
          <div className="template-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="template-detail-header">
              <div className="template-detail-title">
                <span className="template-detail-icon">{detailTemplate.icon || '📋'}</span>
                <h3>{detailTemplate.name}</h3>
              </div>
              <button className="template-detail-close" onClick={() => setShowDetailModal(false)}>
                ✕
              </button>
            </div>
            <div className="template-detail-content">
              <p className="template-detail-desc">{detailTemplate.description}</p>
              <div className="template-detail-roles">
                <h4>Roles ({detailTemplate.roles.length})</h4>
                {detailTemplate.roles.map((role, idx) => {
                  const provider = availableProviders.find(p => p.id === role.provider);
                  return (
                    <div key={idx} className="template-detail-role-card">
                      <div className="template-detail-role-header">
                        <span className="template-detail-role-name">{role.name}</span>
                        <span className="template-detail-role-identity">{role.identity}</span>
                      </div>
                      <div className="template-detail-role-info">
                        {role.archetype_id && (
                          <span className="template-detail-role-item">
                            <strong>Archetype:</strong> {role.archetype_id}
                          </span>
                        )}
                        <span className="template-detail-role-item">
                          <strong>AI Provider:</strong> {provider ? `${provider.name} (${provider.model})` : (role.provider || 'Not configured')}
                        </span>
                        <span className="template-detail-role-item">
                          <strong>Handoff:</strong> {role.handoff_enabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Template Modal */}
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
