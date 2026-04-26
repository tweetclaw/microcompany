import { useMemo, type CSSProperties } from 'react';
import { Group, Panel, Separator, type Layout } from 'react-resizable-panels';
import TaskListPanel from './TaskListPanel';
import ChatInterface from './ChatInterface';
import { Message, Task, TaskSummary, ProviderConfig, AiRunState } from '../types';
import { loadLayoutState, saveLayoutState } from '../utils/layoutState';
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
  currentTaskRoleId: string | null;
  onTaskRoleSelected: (roleId: string) => void;
  onForwardLatestReply: () => void;
  onTaskSelected: (taskSummary: TaskSummary) => void;
  onTaskDeleted?: (taskId: string) => void;
  taskListRefreshKey: number;
  onSettingsClick: () => void;
  isSessionListCollapsed?: boolean;
  isInspectorCollapsed?: boolean;
  isTerminalCollapsed?: boolean;
  runState: AiRunState;
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

export default function TaskModeLayout(props: TaskModeLayoutProps) {
  const initial = useMemo(() => loadLayoutState(), []);
  const seatRows = useMemo(
    () => chunkRoles(props.currentTask?.roles ?? [], 3),
    [props.currentTask],
  );

  const isAiWorking = useMemo(() => {
    const working = props.runState === 'running_thinking' ||
           props.runState === 'running_tool' ||
           props.runState === 'running_generating' ||
           props.runState === 'finalizing';
    console.log('[TaskModeLayout] runState:', props.runState, 'isAiWorking:', working, 'currentTaskRoleId:', props.currentTaskRoleId);
    return working;
  }, [props.runState, props.currentTaskRoleId]);

  const currentRoleName = useMemo(() => {
    if (!props.currentTask || !props.currentTaskRoleId) return null;
    const role = props.currentTask.roles.find(r => r.id === props.currentTaskRoleId);
    return role?.name || null;
  }, [props.currentTask, props.currentTaskRoleId]);

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
                    <p>主界面仅展示会议桌座位布局，不加入流程控制和交互逻辑。</p>
                  </div>
                </div>

                <div className="task-mode-seat-grid">
                  {seatRows.map((row, rowIndex) => (
                    <div className="task-mode-seat-row" key={`row-${rowIndex}`}>
                      {row.map((role) => {
                        const isActive = props.currentTaskRoleId === role.id;
                        const isWorking = isAiWorking && isActive;
                        const isDisabled = isAiWorking && !isActive;
                        const disabledReason = isDisabled ? '当前有角色处理中，暂时无法切换' : undefined;
                        console.log('[TaskModeLayout] Rendering role:', role.name, 'roleId:', role.id, 'isActive:', isActive, 'isWorking:', isWorking, 'isDisabled:', isDisabled);

                        return (
                          <button
                            key={role.id}
                            type="button"
                            className={`task-seat-card ${isActive ? 'active' : ''} ${isWorking ? 'working' : ''} ${isDisabled ? 'disabled' : ''}`}
                            onClick={() => props.onTaskRoleSelected(role.id)}
                            disabled={isDisabled}
                            title={disabledReason}
                            aria-label={isDisabled ? `${role.name}，当前有角色处理中，暂时无法切换` : role.name}
                          >
                            <div className="task-seat-avatar" aria-hidden="true">
                              {getSeatInitials(role.name)}
                            </div>
                            <div className="task-seat-body">
                              <div className="task-seat-name">{role.name}</div>
                              <div className="task-seat-meta">{getRoleArchetypeLabel(role.identity, role.archetype_id)}</div>
                              <div className="task-seat-model">{role.model}</div>
                            </div>
                          </button>
                        );
                      })}
                      {Array.from({ length: Math.max(0, 3 - row.length) }).map((_, emptyIndex) => (
                        <div
                          key={`row-${rowIndex}-empty-${emptyIndex}`}
                          className="task-seat-card task-seat-card-empty"
                          aria-hidden="true"
                        >
                          <div className="task-seat-empty-dot" />
                          <div className="task-seat-empty-label">空座位</div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
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
                <div className="task-mode-chat-panel">
                  <div className="task-mode-chat-panel-header">
                    <div>
                      <div className="task-mode-chat-panel-label">Chat</div>
                      <h3>{currentRoleName || props.currentSessionTitle || '当前会话'}</h3>
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
              <div className="task-mode-empty-icon">📋</div>
              <h2>未选择任务</h2>
              <p>请先创建任务，或从左侧列表中选择一个已有任务。</p>
              <button className="task-mode-empty-button" onClick={props.onNewTask}>
                创建新任务
              </button>
            </div>
          </div>
        </Panel>
      )}
    </Group>
  );
}
