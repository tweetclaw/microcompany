import { useState, useEffect } from 'react';
import { ProviderConfig } from '../types';
import './AddRoleMemberModal.css';

interface AddRoleMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (config: RoleConfig) => void;
  availableProviders: ProviderConfig[];
  existingRoleNames: string[];
}

export interface RoleConfig {
  name: string;
  identity: string;
  archetypeId: string | null;
  provider: string;
  displayOrder?: number;
}

export default function AddRoleMemberModal(props: AddRoleMemberModalProps) {
  const [roleName, setRoleName] = useState('');
  const [identity, setIdentity] = useState('');
  const [archetypeId, setArchetypeId] = useState<string>('custom');
  const [selectedProvider, setSelectedProvider] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  console.log('[AddRoleMemberModal] Available providers:', props.availableProviders.map(p => ({ id: p.id, name: p.name })));

  // Reset form when modal opens
  useEffect(() => {
    if (props.isOpen) {
      setRoleName('');
      setIdentity('');
      setArchetypeId('custom');
      setSelectedProvider('');
      setError(null);
      setIsSubmitting(false);
    }
  }, [props.isOpen]);

  // Auto-select first provider
  useEffect(() => {
    if (props.availableProviders.length > 0 && !selectedProvider) {
      const firstProvider = props.availableProviders[0];
      setSelectedProvider(firstProvider.id);
      console.log('[AddRoleMemberModal] Auto-selected first provider:', firstProvider.id);
    }
  }, [props.availableProviders, selectedProvider]);

  const handleSubmit = async () => {
    setError(null);

    console.log('[AddRoleMemberModal] Submitting with:', {
      roleName: roleName.trim(),
      identity: identity.trim(),
      archetypeId,
      selectedProvider,
    });

    // Validation
    if (!roleName.trim()) {
      setError('角色名称不能为空');
      return;
    }

    if (props.existingRoleNames.includes(roleName.trim())) {
      setError('角色名称已存在，请使用不同的名称');
      return;
    }

    if (!identity.trim()) {
      setError('角色身份不能为空');
      return;
    }

    if (!selectedProvider) {
      setError('请选择 AI Provider');
      return;
    }

    setIsSubmitting(true);

    try {
      const config: RoleConfig = {
        name: roleName.trim(),
        identity: identity.trim(),
        archetypeId: archetypeId === 'custom' ? null : archetypeId,
        provider: selectedProvider,
      };

      console.log('[AddRoleMemberModal] Calling onConfirm with config:', config);
      await props.onConfirm(config);
      props.onClose();
    } catch (err) {
      console.error('[AddRoleMemberModal] Failed to add role:', err);
      setError(err instanceof Error ? err.message : '添加角色失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!props.isOpen) {
    return null;
  }

  const currentProvider = props.availableProviders.find((p) => p.id === selectedProvider);

  return (
    <div className="add-role-modal-overlay" onClick={props.onClose}>
      <div className="add-role-modal" onClick={(e) => e.stopPropagation()}>
        <div className="add-role-modal-header">
          <h2>➕ 添加团队成员</h2>
          <button
            type="button"
            className="add-role-modal-close"
            onClick={props.onClose}
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        <div className="add-role-modal-content">
          {error && (
            <div className="add-role-modal-error">
              ⚠️ {error}
            </div>
          )}

          <div className="add-role-modal-field">
            <label htmlFor="role-name">
              ✏️ 角色名称 <span className="required">*</span>
            </label>
            <input
              id="role-name"
              type="text"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              placeholder="例如：Frontend Developer"
              autoFocus
            />
          </div>

          <div className="add-role-modal-field">
            <label htmlFor="role-identity">
              👤 角色身份 <span className="required">*</span>
            </label>
            <input
              id="role-identity"
              type="text"
              value={identity}
              onChange={(e) => setIdentity(e.target.value)}
              placeholder="例如：负责前端开发和 UI 实现"
            />
          </div>

          <div className="add-role-modal-field">
            <label htmlFor="role-archetype">
              ⚙️ Archetype
            </label>
            <select
              id="role-archetype"
              value={archetypeId}
              onChange={(e) => setArchetypeId(e.target.value)}
            >
              <option value="custom">Custom (自定义)</option>
              {/* 未来可以添加更多预定义的 archetype */}
            </select>
          </div>

          <div className="add-role-modal-field">
            <label htmlFor="role-ai-provider">
              🤖 AI Provider <span className="required">*</span>
            </label>
            <select
              id="role-ai-provider"
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
            >
              <option value="">Select AI Provider...</option>
              {props.availableProviders.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name} ({provider.model})
                </option>
              ))}
            </select>
            {props.availableProviders.length === 0 && (
              <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px' }}>
                ⚠️ 没有可用的 AI Provider，请先在设置中配置
              </div>
            )}
            {currentProvider && (
              <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', marginTop: '4px' }}>
                💡 使用 {currentProvider.name} 的 {currentProvider.model} 模型
              </div>
            )}
          </div>

          <div className="add-role-modal-info">
            💡 新角色将被添加到团队中，并立即可用于协作和 handoff。
          </div>
        </div>

        <div className="add-role-modal-footer">
          <button
            type="button"
            className="add-role-modal-button add-role-modal-button-cancel"
            onClick={props.onClose}
            disabled={isSubmitting}
          >
            取消
          </button>
          <button
            type="button"
            className="add-role-modal-button add-role-modal-button-confirm"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? '添加中...' : '添加成员'}
          </button>
        </div>
      </div>
    </div>
  );
}
