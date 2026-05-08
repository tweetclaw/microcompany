import { useState, useEffect } from 'react';
import { listAllTemplateSummaries, getSystemTemplate } from '../api/templates';
import type { TemplateSummary, SystemTemplate } from '../types/template';
import './TemplatePicker.css';

interface TemplatePickerProps {
  onSelectTemplate: (template: SystemTemplate | TemplateSummary) => void;
  onCancel: () => void;
}

export default function TemplatePicker({ onSelectTemplate, onCancel }: TemplatePickerProps) {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<SystemTemplate | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

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
        setPreviewLoading(true);
        const detail = await getSystemTemplate(template.id);
        setPreviewTemplate(detail);
      } catch {
        // If detail not available, use summary as preview
        setPreviewTemplate(null);
      } finally {
        setPreviewLoading(false);
      }
    } else {
      // For user templates, use summary for preview
      setPreviewTemplate(null);
    }
  };

  const handleUseTemplate = () => {
    if (previewTemplate) {
      onSelectTemplate(previewTemplate);
    } else {
      const selected = templates.find((t) => t.id === selectedId);
      if (selected) {
        onSelectTemplate(selected);
      }
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
        <h2>Choose a Template</h2>
        <p>Start from a template to quickly set up a task with pre-configured roles.</p>
      </div>

      <div className="template-picker-body">
        <div className="template-picker-list">
          {templates.length === 0 && (
            <div className="template-picker-empty">
              <p>No templates available yet.</p>
              <p>Create a task first, then save it as a template to reuse it here.</p>
            </div>
          )}

          {systemTemplates.length > 0 && (
            <div className="template-section">
              <h3 className="template-section-title">System Templates</h3>
              {systemTemplates.map((tpl) => (
                <div
                  key={tpl.id}
                  className={`template-card ${selectedId === tpl.id ? 'selected' : ''}`}
                  onClick={() => handleTemplateClick(tpl)}
                >
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
                  </div>
                </div>
              ))}
            </div>
          )}

          {userTemplates.length > 0 && (
            <div className="template-section">
              <h3 className="template-section-title">Your Templates</h3>
              {userTemplates.map((tpl) => (
                <div
                  key={tpl.id}
                  className={`template-card ${selectedId === tpl.id ? 'selected' : ''}`}
                  onClick={() => handleTemplateClick(tpl)}
                >
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
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="template-picker-preview">
          {previewLoading ? (
            <div className="template-preview-loading">Loading preview...</div>
          ) : previewTemplate ? (
            <div className="template-preview">
              <h3>{previewTemplate.name}</h3>
              <p className="template-preview-desc">{previewTemplate.description}</p>
              <div className="template-preview-roles">
                <h4>Roles ({previewTemplate.roles.length})</h4>
                {previewTemplate.roles.map((role, idx) => (
                  <div key={idx} className="template-preview-role-card">
                    <div className="template-preview-role-header">
                      <span className="template-preview-role-name">{role.name}</span>
                      <span className="template-preview-role-identity">{role.identity}</span>
                    </div>
                    <div className="template-preview-role-details">
                      {role.archetype_id && (
                        <span className="template-role-detail">Archetype: {role.archetype_id}</span>
                      )}
                      <span className="template-role-detail">Provider: {role.provider}</span>
                      <span className="template-role-detail">Model: {role.model}</span>
                      <span className="template-role-detail">
                        Handoff: {role.handoff_enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <button
                className="template-preview-use-btn"
                onClick={handleUseTemplate}
              >
                Use This Template
              </button>
            </div>
          ) : selectedId ? (
            <div className="template-preview">
              <h3>Template Preview</h3>
              <p className="template-preview-placeholder">
                Select a system template to see a detailed preview.
                <br />
                For user templates, you'll go directly to the confirmation page.
              </p>
              <button
                className="template-preview-use-btn"
                onClick={handleUseTemplate}
              >
                Use This Template
              </button>
            </div>
          ) : (
            <div className="template-preview-empty">
              <p>Select a template to preview</p>
            </div>
          )}
        </div>
      </div>

      <div className="template-picker-footer">
        <button className="template-picker-cancel-btn" onClick={onCancel}>
          Back
        </button>
      </div>
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
