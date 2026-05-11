import './DeleteRoleMemberModal.css';

interface DeleteRoleMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  roleName: string;
  isDeleting: boolean;
}

export default function DeleteRoleMemberModal(props: DeleteRoleMemberModalProps) {
  if (!props.isOpen) {
    return null;
  }

  return (
    <div className="delete-role-modal-overlay">
      <div className="delete-role-modal" onClick={(e) => e.stopPropagation()}>
        <div className="delete-role-modal-header">
          <h2>⚠️ 删除团队成员</h2>
          <button
            type="button"
            className="delete-role-modal-close"
            onClick={props.onClose}
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        <div className="delete-role-modal-content">
          <div className="delete-role-modal-warning">
            <div className="delete-role-modal-warning-icon">⚠️</div>
            <div className="delete-role-modal-warning-text">
              <p>你确定要删除角色 <strong>{props.roleName}</strong> 吗？</p>
              <p>此操作将：</p>
              <ul>
                <li>将该角色标记为已删除（软删除）</li>
                <li>保留该角色的历史对话记录</li>
                <li>该角色将不再出现在团队列表中</li>
                <li>无法再向该角色发送新消息</li>
              </ul>
            </div>
          </div>

          <div className="delete-role-modal-info">
            💡 提示：删除操作是软删除，历史数据会被保留。如需彻底删除数据，请使用数据库管理工具。
          </div>
        </div>

        <div className="delete-role-modal-footer">
          <button
            type="button"
            className="delete-role-modal-button delete-role-modal-button-cancel"
            onClick={props.onClose}
            disabled={props.isDeleting}
          >
            取消
          </button>
          <button
            type="button"
            className="delete-role-modal-button delete-role-modal-button-confirm"
            onClick={props.onConfirm}
            disabled={props.isDeleting}
          >
            {props.isDeleting ? '删除中...' : '确认删除'}
          </button>
        </div>
      </div>
    </div>
  );
}
