import { useState, useEffect } from 'react';
import { ProviderConfig } from '../types';
import { TaskRole } from '../types/api';
import './EditRoleMemberModal.css';

interface EditRoleMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (roleId: string, updates: RoleUpdateConfig) => void;
  availableProviders: ProviderConfig[];
  existingRoleNames: string[];
  role: TaskRole | null;
}

export interface RoleUpdateConfig {
  name?: string;
  identity?: string;
  archetypeId?: string | null;
  provider?: string;
  displayOrder?: number;
}

export default function EditRoleMemberModal(props: EditRoleMemberModalProps) {
  const [roleName, setRoleName] = useState('');
  const [identity, setIdentity] = useState('');
  const [archetypeId, setArchetypeId] = useState<string>('custom');
  const [selectedProvider, setSelectedProvider] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  console.log('[EditRoleMemberModal] Available providers:', props.availableProviders.map(p => ({ id: p.id, name: p.name })));

  // Initialize form with role data
  useEffect(() => {
    if (props.isOpen && props.role) {
      console.log('[EditRoleMemberModal] Initializing with role:', props.role);
      setRoleName(props.role.name);
      setIdentity(props.role.identity);
      setArchetypeId(props.role.archetype_id || 'custom');
      
      // Use the provider field directly (it's already the Provider ID)
      const roleProvider = props.role.provider;
      if (roleProvider) {
        setSelectedProvider(roleProvider);
        console.log('[EditRoleMemberModal] Using role provider:', roleProvider);
      } else if (props.availableProviders.length > 0) {
        setSelectedProvider(props.availableProviders[0].id);
        console.log('[EditRoleMemberModal] Using first provider:', props.availableProviders[0].id);
      }
      
      setError(null);
      setIsSubmitting(false);
    }
  }, [props.isOpen, props.role, props.availableProviders]);

  const handleSubmit = async () => {
    if (!props.role) return;
    
    setError(null);

    console.log('[EditRoleMemberModal] Submitting with:', {
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

    // Check if name changed and conflicts with existing names
    if (roleName.trim() !== props.role.name && 
        props.existingRoleNames.includes(roleName.trim())) {
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
      const updates: RoleUpdateConfig = {};
      
      // Only include changed fields
      if (roleName.trim() !== props.role.name) {
        updates.name = roleName.trim();
      }
      
      if (identity.trim() !== props.role.identity) {
        updates.identity = identity.trim();
      }
      
      const newArchetypeId = archetypeId === 'custom' ? null : archetypeId;
      if (newArchetypeId !== props.role.archetype_id) {
        updates.archetypeId = newArchetypeId;
      }
      
      if (selectedProvider !== props.role.provider) {
        updates.provider = selectedProvider;
      }

      // If no changes, just close
      if (Object.keys(updates).length === 0) {
        console.log('[EditRoleMemberModal] No changes detected, closing modal');
        props.onClose();
        return;
      }

      console.log('[EditRoleMemberModal] Calling onConfirm with updates:', updates);
      await props.onConfirm(props.role.id, updates);
      props.onClose();
    } catch (err) {
      console.error('[EditRoleMemberModal] Failed to update role:', err);
      setError(err instanceof Error ? err.message : '更新角色失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!props.isOpen || !props.role) {
    return null;
  }

  const currentProvider = props.availableProviders.find((p) => p.id === selectedProvider);

  return (
    <div className="edit-role-modal-overlay">
      <div className="edit-role-modal" onClick={(e) => e.stopPropagation()}>
        <div className="edit-role-modal-header">
          <h2>✏️ 编辑团队成员</h2>
          <button
            type="button"
            className="edit-role-modal-close"
            onClick={props.onClose}
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        <div className="edit-role-modal-content">
          {error && (
            <div className="edit-role-modal-error">
              ⚠️ {error}
            </div>
          )}

          <div className="edit-role-modal-field">
            <label htmlFor="edit-role-name">
              ✏️ 角色名称 <span className="required">*</span>
            </label>
            <input
              id="edit-role-name"
              type="text"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              placeholder="例如：Frontend Developer"
              autoFocus
            />
          </div>

          <div className="edit-role-modal-field">
            <label htmlFor="edit-role-identity">
              👤 角色身份 <span className="required">*</span>
            </label>
            <input
              id="edit-role-identity"
              type="text"
              value={identity}
              onChange={(e) => setIdentity(e.target.value)}
              placeholder="例如：负责前端开发和 UI 实现"
            />
          </div>

          <div className="edit-role-modal-field">
            <label htmlFor="edit-role-archetype">
              ⚙️ Archetype
            </label>
            <select
              id="edit-role-archetype"
              value={archetypeId}
              onChange={(e) => setArchetypeId(e.target.value)}
            >
              <option value="custom">Custom (自定义)</option>
              {/* 未来可以添加更多预定义的 archetype */}
            </select>
          </div>

          <div className="edit-role-modal-field">
            <label htmlFor="edit-role-ai-provider">
              🤖 AI Provider <span className="required">*</span>
            </label>
            <select
              id="edit-role-ai-provider"
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

          <div className="edit-role-modal-info">
            💡 修改后的配置将立即生效，但不会影响该角色的历史对话。
          </div>
        </div>

        <div className="edit-role-modal-footer">
          <button
            type="button"
            className="edit-role-modal-button edit-role-modal-button-cancel"
            onClick={props.onClose}
            disabled={isSubmitting}
          >
            取消
          </button>
          <button
            type="button"
            className="edit-role-modal-button edit-role-modal-button-confirm"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? '保存中...' : '保存修改'}
          </button>
        </div>
      </div>
    </div>
  );
}
