import { TaskRole } from '../types';

interface SortableRoleCardProps {
  role: TaskRole;
  providerDisplayName: string;
  isActive: boolean;
  isWorking: boolean;
  isDisabled: boolean;
  isPmFirst: boolean;
  disabledReason?: string;
  onRoleSelected: (roleId: string) => void;
  onEditClick: (role: TaskRole) => void;
  onDeleteClick: (role: TaskRole) => void;
  onRestartClick: (roleId: string) => void;
  isAiWorking: boolean;
  totalRoles: number;
  getSeatInitials: (name: string) => string;
  getRoleArchetypeLabel: (identity: string, archetypeId: string | null) => string;
}

export default function SortableRoleCard(props: SortableRoleCardProps) {
  return (
    <article
      role="button"
      tabIndex={props.isDisabled ? -1 : 0}
      className={`task-seat-card ${props.isActive ? 'active' : ''} ${props.isWorking ? 'working' : ''} ${props.isDisabled ? 'disabled' : ''} ${props.isPmFirst ? 'pm-first' : ''}`}
      onClick={() => {
        if (!props.isDisabled) {
          props.onRoleSelected(props.role.id);
        }
      }}
      onKeyDown={(event) => {
        if (props.isDisabled) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          props.onRoleSelected(props.role.id);
        }
      }}
      title={props.disabledReason}
      aria-disabled={props.isDisabled}
      aria-label={props.isDisabled ? `${props.role.name}，当前有角色处理中，暂时无法切换` : props.role.name}
    >
      <div className="task-seat-card-actions">
        <button
          type="button"
          className="task-seat-edit-button"
          onClick={(event) => {
            event.stopPropagation();
            props.onEditClick(props.role);
          }}
          disabled={props.isAiWorking}
          aria-label={`编辑 ${props.role.name}`}
          title={props.isAiWorking ? 'AI 处理中时暂时不能编辑' : '编辑角色配置'}
        >
          ✏️ 编辑
        </button>
        <button
          type="button"
          className="task-seat-delete-button"
          onClick={(event) => {
            event.stopPropagation();
            props.onDeleteClick(props.role);
          }}
          disabled={props.isAiWorking || props.totalRoles <= 1}
          aria-label={`删除 ${props.role.name}`}
          title={
            props.isAiWorking 
              ? 'AI 处理中时暂时不能删除' 
              : props.totalRoles <= 1
              ? '至少需要保留一个角色'
              : '删除角色'
          }
        >
          🗑️ 删除
        </button>
        <button
          type="button"
          className="task-seat-restart-button"
          onClick={(event) => {
            event.stopPropagation();
            props.onRestartClick(props.role.id);
          }}
          disabled={props.isAiWorking}
          aria-label={`为 ${props.role.name} 新开 session`}
          title={props.isAiWorking ? 'AI 处理中时暂时不能新开 session' : '为该角色新开 session'}
        >
          新开 session
        </button>
      </div>
      <div className="task-seat-avatar" aria-hidden="true">
        {props.getSeatInitials(props.role.name)}
      </div>
      <div className="task-seat-body">
        <div className="task-seat-name">{props.role.name}</div>
        <div className="task-seat-meta">{props.getRoleArchetypeLabel(props.role.identity, props.role.archetype_id)}</div>
        <div className="task-seat-model">{props.providerDisplayName}</div>
        {props.isPmFirst && <div className="task-seat-badge">Start here</div>}
      </div>
    </article>
  );
}
