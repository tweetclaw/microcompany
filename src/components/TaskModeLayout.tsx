import { useMemo, type CSSProperties } from 'react';
import { Group, Panel, Separator, type Layout } from 'react-resizable-panels';
import TaskListPanel from './TaskListPanel';
import ChatInterface from './ChatInterface';
import { AiRequestEndEvent, Message, Task, TaskSummary, ProviderConfig, AiRunState, TeamBrief } from '../types';
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
  currentTeamBrief: TeamBrief | null;
  currentTaskRoleId: string | null;
  onTaskRoleSelected: (roleId: string) => void;
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
  const seatRows = useMemo(
    () => chunkRoles(props.currentTask?.roles ?? [], 3),
    [props.currentTask],
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
                    <p>
                      {props.currentTask.pm_first_workflow
                        ? 'Start with the Product Manager, let them review the proposal doc, then follow their suggested next role and handoff message.'
                        : 'Select a role at the table and work through the task one specialist at a time.'}
                    </p>
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

                <div className="task-mode-seat-grid">
                  {seatRows.map((row, rowIndex) => (
                    <div className="task-mode-seat-row" key={`row-${rowIndex}`}>
                      {row.map((role) => {
                        const isActive = props.currentTaskRoleId === role.id;
                        const isWorking = isAiWorking && isActive;
                        const isDisabled = isAiWorking && !isActive;
                        const isPmFirst = props.currentTask?.pm_first_workflow && pmRole?.id === role.id;
                        const disabledReason = isDisabled ? '当前有角色处理中，暂时无法切换' : undefined;

                        return (
                          <button
                            key={role.id}
                            type="button"
                            className={`task-seat-card ${isActive ? 'active' : ''} ${isWorking ? 'working' : ''} ${isDisabled ? 'disabled' : ''} ${isPmFirst ? 'pm-first' : ''}`}
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
                              {isPmFirst && <div className="task-seat-badge">Start here</div>}
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
                          <div className="task-seat-empty-label">Empty seat</div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>

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
                      onHandoffSuggestion={props.onHandoffSuggestion}
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
    </Group>
  );
}
