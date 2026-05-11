import { useMemo, useState, type CSSProperties } from 'react';
import { Group, Panel, Separator, type Layout } from 'react-resizable-panels';
import { DndContext, closestCenter, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import TaskListPanel from './TaskListPanel';
import ChatInterface from './ChatInterface';
import SaveTemplateModal from './SaveTemplateModal';
import AddRoleMemberModal, { type RoleConfig } from './AddRoleMemberModal';
import EditRoleMemberModal, { type RoleUpdateConfig } from './EditRoleMemberModal';
import DeleteRoleMemberModal from './DeleteRoleMemberModal';
import SortableRoleCard from './SortableRoleCard';
import { AiRequestEndEvent, Message, Task, TaskSummary, ProviderConfig, AiRunState, TeamBrief, TaskRole } from '../types';
import { loadLayoutState, saveLayoutState } from '../utils/layoutState';
import { saveTaskAsTemplate } from '../api/templates';
import { addTaskRole, updateTaskRole, deleteTaskRole, reorderTaskRoles } from '../api/index';
import './TaskModeLayout.css';
import './ResizeHandle.css';

const PANEL_FILL_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

interface TaskModeLayoutProps {
  workingDirectory: string;
  currentSessionId: string | null;
  currentSessionTitle: string | null;
  currentProviderName: string | null;
  currentModelName: string | null;
  availableProviders: ProviderConfig[];
  selectedProviderValue: string;
  messages: Message[];
  onMessagesChange: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  sessionListRefreshKey: number;
  onSessionSelected: (sessionId: string) => void;
  onSessionDeleted: (sessionId: string) => void;
  onNewChatWithModel: (modelValue: string) => void;
  onNewTask: () => void;
  hasActiveSession: boolean;
  isDraftConversation: boolean;
  onEnsureSession: () => Promise<string | null>;
  currentTask: Task | null;
  currentTeamBrief: TeamBrief | null;
  currentTaskRoleId: string | null;
  onTaskRoleSelected: (roleId: string) => void;
  onTaskRoleRestart: (roleId: string) => void;
  onForwardLatestReply: () => void;
  onHandoffSuggestion?: (event: AiRequestEndEvent) => void;
  onTaskSelected: (taskSummary: TaskSummary) => void;
  onTaskDeleted?: (taskId: string) => void;
  taskListRefreshKey: number;
  onSettingsClick: () => void;
  isSessionListCollapsed?: boolean;
  isInspectorCollapsed?: boolean;
  isTerminalCollapsed?: boolean;
  runState: AiRunState;
  onRunStateChange?: (runState: AiRunState) => void;
}

function getSeatInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'AI';
}

function chunkRoles<T>(items: T[], size: number) {
  const rows: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }

  return rows;
}

function getRoleArchetypeLabel(identity: string, archetypeId: string | null) {
  if (archetypeId === 'custom') {
    return 'Custom archetype';
  }

  return identity;
}

function getRecommendedRoleNames(teamBrief: TeamBrief | null, roleId: string) {
  const briefRole = teamBrief?.roles.find((item) => item.roleId === roleId);
  if (!briefRole || briefRole.recommendedNextRoleIds.length === 0) {
    return [];
  }

  return briefRole.recommendedNextRoleIds
    .map((nextRoleId) => teamBrief?.roles.find((item) => item.roleId === nextRoleId)?.roleName)
    .filter((name): name is string => Boolean(name));
}

export default function TaskModeLayout(props: TaskModeLayoutProps) {
  const initial = useMemo(() => loadLayoutState(), []);
  const [localRoles, setLocalRoles] = useState<TaskRole[]>([]);
  
  // 同步 props.currentTask.roles 到 localRoles
  useMemo(() => {
    if (props.currentTask?.roles) {
      setLocalRoles([...props.currentTask.roles].sort((a, b) => a.display_order - b.display_order));
    }
  }, [props.currentTask?.roles]);
  
  const seatRows = useMemo(
    () => chunkRoles(localRoles, 3),
    [localRoles],
  );
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [saveTemplateError, setSaveTemplateError] = useState<string | null>(null);
  const [showAddRoleModal, setShowAddRoleModal] = useState(false);
  const [isAddingRole, setIsAddingRole] = useState(false);
  const [showEditRoleModal, setShowEditRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState<TaskRole | null>(null);
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [showDeleteRoleModal, setShowDeleteRoleModal] = useState(false);
  const [deletingRole, setDeletingRole] = useState<TaskRole | null>(null);
  const [isDeletingRole, setIsDeletingRole] = useState(false);
  const [isReorderingRoles, setIsReorderingRoles] = useState(false);
  
  // 配置拖拽传感器
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 拖拽至少移动 8px 才激活，避免误触
      },
    })
  );

  const isAiWorking = useMemo(() => {
    return props.runState === 'running_thinking'
      || props.runState === 'running_tool'
      || props.runState === 'running_generating'
      || props.runState === 'finalizing';
  }, [props.runState]);

  const currentRoleName = useMemo(() => {
    if (!props.currentTask || !props.currentTaskRoleId) return null;
    const role = props.currentTask.roles.find(r => r.id === props.currentTaskRoleId);
    return role?.name || null;
  }, [props.currentTask, props.currentTaskRoleId]);

  const pmRole = useMemo(() => {
    return props.currentTask?.roles.find((role) => {
      const identity = role.identity.trim().toLowerCase();
      return role.archetype_id === 'product_manager'
        || identity === 'product manager'
        || identity === 'pm'
        || identity === '项目经理'
        || identity === '产品经理';
    }) ?? null;
  }, [props.currentTask]);

  const shouldHighlightPmFirst = Boolean(
    props.currentTask?.pm_first_workflow
    && pmRole
    && props.currentTaskRoleId === pmRole.id
  );

  const handleLayoutChanged = (layout: Layout) => {
    const current = loadLayoutState();
    const next = { ...current };
    let dirty = false;

    const sidebarSize = layout['task-list'];
    if (typeof sidebarSize === 'number' && Number.isFinite(sidebarSize)
      && Math.abs(current.sidebarSize - sidebarSize) > 0.01) {
      next.sidebarSize = sidebarSize;
      dirty = true;
    }

    const inspectorSize = layout['task-inspector'];
    if (typeof inspectorSize === 'number' && Number.isFinite(inspectorSize)
      && Math.abs(current.inspectorSize - inspectorSize) > 0.01) {
      next.inspectorSize = inspectorSize;
      dirty = true;
    }

    if (dirty) saveLayoutState(next);
  };

  const handleSaveAsTemplate = async (name: string, description: string) => {
    if (!props.currentTask) return;

    console.log(`[TaskModeLayout] handleSaveAsTemplate: Saving task "${props.currentTask.name}" as template "${name}"`);

    try {
      setSaveTemplateError(null);
      await saveTaskAsTemplate({
        name,
        description,
        icon: 'team',
        source_task_id: props.currentTask.id,
      });
      setShowSaveTemplateModal(false);
      console.log(`[TaskModeLayout] handleSaveAsTemplate: Template saved successfully`);
      // TODO: 可以添加成功提示
      alert('模板保存成功！');
    } catch (error) {
      console.error('[TaskModeLayout] handleSaveAsTemplate: Failed to save template:', error);
      setSaveTemplateError(error instanceof Error ? error.message : '保存模板失败');
    }
  };

  const handleAddRole = async (config: RoleConfig) => {
    if (!props.currentTask || isAddingRole) return;

    console.log(`[TaskModeLayout] handleAddRole: Adding role "${config.name}" to task ${props.currentTask.id}`);
    console.log(`[TaskModeLayout] handleAddRole: Role config:`, config);

    setIsAddingRole(true);
    try {
      // 调用后端 API 添加角色
      await addTaskRole(
        props.currentTask.id,
        config.name,
        config.identity,
        config.archetypeId,
        config.provider,
        config.displayOrder,
        config.handoffEnabled,
        config.systemPromptAppend,
        config.customSystemPrompt,
      );

      console.log(`[TaskModeLayout] handleAddRole: Role added successfully, refreshing task`);

      // 刷新任务列表以显示新角色
      // 通过重新选择当前任务来触发刷新
      const taskSummary: TaskSummary = {
        id: props.currentTask.id,
        name: props.currentTask.name,
        description: props.currentTask.description || '',
        icon: props.currentTask.icon || 'team',
        pm_first_workflow: props.currentTask.pm_first_workflow,
        role_count: props.currentTask.roles.length + 1,
        total_messages: 0, // 新角色还没有消息
        status: 'active',
        created_at: props.currentTask.created_at,
        updated_at: new Date().toISOString(),
      };
      
      props.onTaskSelected(taskSummary);

      setShowAddRoleModal(false);
      console.log(`[TaskModeLayout] handleAddRole: Task refreshed, modal closed`);
      alert(`成功添加角色：${config.name}`);
    } catch (error) {
      console.error('[TaskModeLayout] handleAddRole: Failed to add role:', error);
      throw error; // 让 Modal 处理错误显示
    } finally {
      setIsAddingRole(false);
    }
  };

  const handleUpdateRole = async (roleId: string, updates: RoleUpdateConfig) => {
    if (!props.currentTask || isUpdatingRole) return;

    console.log(`[TaskModeLayout] handleUpdateRole: Updating role ${roleId} in task ${props.currentTask.id}`);
    console.log(`[TaskModeLayout] handleUpdateRole: Updates:`, updates);

    setIsUpdatingRole(true);
    try {
      // 调用后端 API 更新角色
      await updateTaskRole(props.currentTask.id, roleId, updates);

      console.log(`[TaskModeLayout] handleUpdateRole: Role updated successfully, refreshing task`);

      // 刷新任务以显示更新后的角色
      const taskSummary: TaskSummary = {
        id: props.currentTask.id,
        name: props.currentTask.name,
        description: props.currentTask.description || '',
        icon: props.currentTask.icon || 'team',
        pm_first_workflow: props.currentTask.pm_first_workflow,
        role_count: props.currentTask.roles.length,
        total_messages: 0,
        status: 'active',
        created_at: props.currentTask.created_at,
        updated_at: new Date().toISOString(),
      };
      
      props.onTaskSelected(taskSummary);

      setShowEditRoleModal(false);
      setEditingRole(null);
      console.log(`[TaskModeLayout] handleUpdateRole: Task refreshed, modal closed`);
      alert(`成功更新角色配置`);
    } catch (error) {
      console.error('[TaskModeLayout] handleUpdateRole: Failed to update role:', error);
      throw error; // 让 Modal 处理错误显示
    } finally {
      setIsUpdatingRole(false);
    }
  };

  const handleEditRoleClick = (role: TaskRole) => {
    setEditingRole(role);
    setShowEditRoleModal(true);
  };

  const handleDeleteRoleClick = (role: TaskRole) => {
    setDeletingRole(role);
    setShowDeleteRoleModal(true);
  };

  const handleDeleteRole = async () => {
    if (!props.currentTask || !deletingRole || isDeletingRole) return;

    console.log(`[TaskModeLayout] handleDeleteRole: Deleting role "${deletingRole.name}" (${deletingRole.id}) from task ${props.currentTask.id}`);

    setIsDeletingRole(true);
    try {
      // 调用后端 API 删除角色
      await deleteTaskRole(props.currentTask.id, deletingRole.id);

      console.log(`[TaskModeLayout] handleDeleteRole: Role deleted successfully, refreshing task`);

      // 刷新任务以显示更新后的角色列表
      const taskSummary: TaskSummary = {
        id: props.currentTask.id,
        name: props.currentTask.name,
        description: props.currentTask.description || '',
        icon: props.currentTask.icon || 'team',
        pm_first_workflow: props.currentTask.pm_first_workflow,
        role_count: props.currentTask.roles.length - 1,
        total_messages: 0,
        status: 'active',
        created_at: props.currentTask.created_at,
        updated_at: new Date().toISOString(),
      };
      
      props.onTaskSelected(taskSummary);

      setShowDeleteRoleModal(false);
      setDeletingRole(null);
      console.log(`[TaskModeLayout] handleDeleteRole: Task refreshed, modal closed`);
      alert(`成功删除角色：${deletingRole.name}`);
    } catch (error) {
      console.error('[TaskModeLayout] handleDeleteRole: Failed to delete role:', error);
      alert(`删除角色失败：${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsDeletingRole(false);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    console.log(`[TaskModeLayout] handleDragEnd: Drag ended`, { activeId: active.id, overId: over?.id });
    
    if (!over || active.id === over.id || !props.currentTask || isReorderingRoles) {
      if (!over) {
        console.log(`[TaskModeLayout] handleDragEnd: No drop target, ignoring`);
      } else if (active.id === over.id) {
        console.log(`[TaskModeLayout] handleDragEnd: Dropped on same position, ignoring`);
      } else if (isReorderingRoles) {
        console.log(`[TaskModeLayout] handleDragEnd: Already reordering, ignoring`);
      }
      return;
    }

    const oldIndex = localRoles.findIndex(r => r.id === active.id);
    const newIndex = localRoles.findIndex(r => r.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      console.warn(`[TaskModeLayout] handleDragEnd: Invalid indices`, { oldIndex, newIndex });
      return;
    }

    console.log(`[TaskModeLayout] handleDragEnd: Moving role from index ${oldIndex} to ${newIndex}`);

    // 乐观更新 UI
    const newRoles = arrayMove(localRoles, oldIndex, newIndex);
    setLocalRoles(newRoles);
    console.log(`[TaskModeLayout] handleDragEnd: UI updated optimistically`);

    // 调用后端 API 保存新顺序
    setIsReorderingRoles(true);
    try {
      const roleOrders = newRoles.map((role, index) => ({
        roleId: role.id,
        displayOrder: index,
      }));

      console.log(`[TaskModeLayout] handleDragEnd: Saving new order to backend`, roleOrders);
      await reorderTaskRoles(props.currentTask.id, roleOrders);

      console.log(`[TaskModeLayout] handleDragEnd: Order saved successfully, refreshing task`);

      // 刷新任务以确保数据同步
      const taskSummary: TaskSummary = {
        id: props.currentTask.id,
        name: props.currentTask.name,
        description: props.currentTask.description || '',
        icon: props.currentTask.icon || 'team',
        pm_first_workflow: props.currentTask.pm_first_workflow,
        role_count: props.currentTask.roles.length,
        total_messages: 0,
        status: 'active',
        created_at: props.currentTask.created_at,
        updated_at: new Date().toISOString(),
      };
      
      props.onTaskSelected(taskSummary);
      console.log(`[TaskModeLayout] handleDragEnd: Task refreshed successfully`);
    } catch (error) {
      console.error('[TaskModeLayout] handleDragEnd: Failed to reorder roles:', error);
      // 回滚到原来的顺序
      console.log(`[TaskModeLayout] handleDragEnd: Rolling back to original order`);
      setLocalRoles([...props.currentTask.roles].sort((a, b) => a.display_order - b.display_order));
      alert(`调整角色顺序失败：${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsReorderingRoles(false);
    }
  };

  const existingRoleNames = useMemo(() => {
    return props.currentTask?.roles.map(role => role.name) ?? [];
  }, [props.currentTask]);

  return (
    <Group
      orientation="horizontal"
      className="task-mode-layout"
      onLayoutChanged={handleLayoutChanged}
    >
      {!props.isSessionListCollapsed && (
        <>
          <Panel
            id="task-list"
            defaultSize={`${initial.sidebarSize}%`}
            minSize="10%"
            maxSize="40%"
            style={PANEL_FILL_STYLE}
          >
            <TaskListPanel
              onNewTaskClick={props.onNewTask}
              onTaskSelected={props.onTaskSelected}
              onTaskDeleted={props.onTaskDeleted}
              currentTaskId={props.currentTask?.id || null}
              refreshKey={props.taskListRefreshKey}
              availableProviders={props.availableProviders}
            />
          </Panel>
          <Separator />
        </>
      )}
      {props.currentTask ? (
        <>
          <Panel id="meeting-room" minSize="35%" style={PANEL_FILL_STYLE}>
            <div className="task-mode-meeting-room">
              <div className="task-mode-room-shell">
                <div className="task-mode-room-header">
                  <div>
                    <div className="task-mode-room-label">Task Room</div>
                    <h2>{props.currentTask.name}</h2>
                    <p>
                      {props.currentTask.pm_first_workflow
                        ? 'Start with the Product Manager, let them review the proposal doc, then follow their suggested next role and handoff message.'
                        : 'Select a role at the table and work through the task one specialist at a time.'}
                    </p>
                  </div>
                  <div className="task-mode-room-header-actions">
                    <button
                      type="button"
                      className="task-mode-add-member-button"
                      onClick={() => setShowAddRoleModal(true)}
                      disabled={isAiWorking}
                      title={isAiWorking ? 'AI 处理中时暂时不能添加成员' : '添加新的团队成员'}
                    >
                      ➕ 添加成员
                    </button>
                    <button
                      type="button"
                      className="task-mode-save-template-button"
                      onClick={() => setShowSaveTemplateModal(true)}
                      disabled={isAiWorking}
                      title={isAiWorking ? 'AI 处理中时暂时不能保存模板' : '将当前团队结构保存为模板'}
                    >
                      保存为模板
                    </button>
                  </div>
                </div>

                {props.currentTask.pm_first_workflow && pmRole && (
                  <div className={`task-mode-pm-banner ${shouldHighlightPmFirst ? 'active' : ''}`}>
                    <div className="task-mode-pm-banner-title">PM-first workflow</div>
                    <p>
                      Begin with <strong>{pmRole.name}</strong>. Ask them to read <code>docs/v2/task-template-system-proposal.md</code>, define the smallest scope, and tell you exactly which role should work next.
                    </p>
                  </div>
                )}


                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={localRoles.map(r => r.id)} strategy={rectSortingStrategy}>
                    <div className="task-mode-seat-grid">
                      {seatRows.map((row, rowIndex) => (
                        <div className="task-mode-seat-row" key={`row-${rowIndex}`}>
                          {row.map((role) => {
                            const isActive = props.currentTaskRoleId === role.id;
                            const isWorking = isAiWorking && isActive;
                            const isDisabled = isAiWorking && !isActive;
                            const isPmFirst = Boolean(props.currentTask?.pm_first_workflow && pmRole?.id === role.id);
                            const disabledReason = isDisabled ? '当前有角色处理中，暂时无法切换' : undefined;

                            return (
                              <SortableRoleCard
                                key={role.id}
                                role={role}
                                isActive={isActive}
                                isWorking={isWorking}
                                isDisabled={isDisabled}
                                isPmFirst={isPmFirst}
                                disabledReason={disabledReason}
                                onRoleSelected={props.onTaskRoleSelected}
                                onEditClick={handleEditRoleClick}
                                onDeleteClick={handleDeleteRoleClick}
                                onRestartClick={props.onTaskRoleRestart}
                                isAiWorking={isAiWorking}
                                totalRoles={localRoles.length}
                                getSeatInitials={getSeatInitials}
                                getRoleArchetypeLabel={getRoleArchetypeLabel}
                              />
                            );
                          })}
                          {Array.from({ length: Math.max(0, 3 - row.length) }).map((_, emptyIndex) => (
                            <div
                              key={`row-${rowIndex}-empty-${emptyIndex}`}
                              className="task-seat-card task-seat-card-empty"
                              aria-hidden="true"
                            >
                              <div className="task-seat-empty-dot" />
                              <div className="task-seat-empty-label">Empty seat</div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>

                {props.currentTeamBrief && (
                  <section className="task-team-brief" aria-label="Team Brief">
                    <div className="task-team-brief-header">
                      <div>
                        <div className="task-team-brief-label">Team Brief</div>
                        <h3>Who is on this task team</h3>
                      </div>
                      <p>
                        Shared context for every seat: who owns what, and who each role can reasonably hand off to next.
                      </p>
                    </div>
                    <div className="task-team-brief-grid">
                      {props.currentTeamBrief.roles.map((role) => {
                        const recommendedRoleNames = getRecommendedRoleNames(props.currentTeamBrief, role.roleId);
                        return (
                          <article
                            key={role.roleId}
                            className={`task-team-brief-card ${props.currentTaskRoleId === role.roleId ? 'active' : ''}`}
                          >
                            <div className="task-team-brief-card-top">
                              <div>
                                <div className="task-team-brief-role-name">{role.roleName}</div>
                                <div className="task-team-brief-role-meta">
                                  {role.archetypeLabel || getRoleArchetypeLabel(role.identity, role.archetypeId ?? null)}
                                </div>
                              </div>
                              {props.currentTaskRoleId === role.roleId && (
                                <div className="task-team-brief-active-badge">Current seat</div>
                              )}
                            </div>
                            <div className="task-team-brief-section">
                              <div className="task-team-brief-section-label">Main responsibility</div>
                              <p>{role.responsibilitySummary || 'No archetype summary available yet.'}</p>
                            </div>
                            <div className="task-team-brief-section">
                              <div className="task-team-brief-section-label">Suggested handoff</div>
                              <p>{role.handoffGuidance || 'No handoff guidance available yet.'}</p>
                            </div>
                            <div className="task-team-brief-section">
                              <div className="task-team-brief-section-label">Next teammates</div>
                              {recommendedRoleNames.length > 0 ? (
                                <div className="task-team-brief-chip-row">
                                  {recommendedRoleNames.map((name) => (
                                    <span key={`${role.roleId}-${name}`} className="task-team-brief-chip">{name}</span>
                                  ))}
                                </div>
                              ) : (
                                <p className="task-team-brief-empty">No recommended next role on this roster.</p>
                              )}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                )}
              </div>
            </div>
          </Panel>
          {!props.isInspectorCollapsed && (
            <>
              <Separator />
              <Panel
                id="task-inspector"
                defaultSize={`${initial.inspectorSize}%`}
                minSize="20%"
                maxSize="40%"
                style={PANEL_FILL_STYLE}
              >
                <div className={`task-mode-chat-panel ${isAiWorking ? 'working' : ''}`}>
                  <div className="task-mode-chat-panel-header">
                    <div>
                      <div className="task-mode-chat-panel-label">Chat</div>
                      <div className="task-mode-chat-title-row">
                        <h3>{currentRoleName || props.currentSessionTitle || '当前会话'}</h3>
                        {isAiWorking && currentRoleName && (
                          <span className="task-mode-chat-working-badge">AI working</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="task-mode-chat-wrapper">
                    <ChatInterface
                      workingDirectory={props.workingDirectory}
                      currentSessionId={props.currentSessionId}
                      currentSessionTitle={props.currentSessionTitle}
                      currentProviderName={props.currentProviderName}
                      currentModelName={props.currentModelName}
                      availableProviders={props.availableProviders}
                      selectedProviderValue={props.selectedProviderValue}
                      messages={props.messages}
                      onMessagesChange={props.onMessagesChange}
                      sessionListRefreshKey={props.sessionListRefreshKey}
                      onSessionSelected={props.onSessionSelected}
                      onSessionDeleted={props.onSessionDeleted}
                      onNewChatWithModel={props.onNewChatWithModel}
                      onNewTask={props.onNewTask}
                      hasActiveSession={props.hasActiveSession}
                      isDraftConversation={props.isDraftConversation}
                      onEnsureSession={props.onEnsureSession}
                      onSettingsClick={props.onSettingsClick}
                      onRunStateChange={props.onRunStateChange}
                      onHandoffSuggestion={props.onHandoffSuggestion}
                      availableRoleNames={props.currentTask?.roles.map(r => r.name) || []}
                      taskRoles={props.currentTask?.roles.map(r => ({ id: r.id, name: r.name })) || []}
                      currentRoleName={currentRoleName}
                      hideSidebar={true}
                      hideInspector={true}
                      hideNewButtons={true}
                      hideToolbar={true}
                      hideTitleBar={true}
                      externalTerminalCollapsed={props.isTerminalCollapsed}
                    />
                  </div>
                </div>
              </Panel>
            </>
          )}
        </>
      ) : (
        <Panel id="empty" minSize="30%" style={PANEL_FILL_STYLE}>
          <div className="task-mode-empty">
            <div className="task-mode-empty-content">
              <h2>No task selected</h2>
              <p>Create a task or pick one from the list to open the room.</p>
              <button className="task-mode-empty-button" onClick={props.onNewTask}>
                Create task
              </button>
            </div>
          </div>
        </Panel>
      )}
      {showSaveTemplateModal && (
        <SaveTemplateModal
          taskName={props.currentTask?.name || '未命名任务'}
          onSave={handleSaveAsTemplate}
          onCancel={() => {
            setShowSaveTemplateModal(false);
            setSaveTemplateError(null);
          }}
        />
      )}
      {showAddRoleModal && (
        <AddRoleMemberModal
          isOpen={showAddRoleModal}
          onClose={() => setShowAddRoleModal(false)}
          onConfirm={handleAddRole}
          availableProviders={props.availableProviders}
          existingRoleNames={existingRoleNames}
        />
      )}
      {showEditRoleModal && (
        <EditRoleMemberModal
          isOpen={showEditRoleModal}
          onClose={() => {
            setShowEditRoleModal(false);
            setEditingRole(null);
          }}
          onConfirm={handleUpdateRole}
          availableProviders={props.availableProviders}
          existingRoleNames={existingRoleNames}
          role={editingRole}
        />
      )}
      {showDeleteRoleModal && (
        <DeleteRoleMemberModal
          isOpen={showDeleteRoleModal}
          onClose={() => {
            setShowDeleteRoleModal(false);
            setDeletingRole(null);
          }}
          onConfirm={handleDeleteRole}
          roleName={deletingRole?.name || ''}
          isDeleting={isDeletingRole}
        />
      )}
    </Group>
  );
}
