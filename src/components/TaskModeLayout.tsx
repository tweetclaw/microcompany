import { useMemo, type CSSProperties } from 'react';
import { Group, Panel, Separator, type Layout } from 'react-resizable-panels';
import TaskListPanel from './TaskListPanel';
import ChatInterface from './ChatInterface';
import TaskInspector from './TaskInspector';
import { Message, Task, TaskSummary, ProviderConfig } from '../types';
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
}

export default function TaskModeLayout(props: TaskModeLayoutProps) {
  const initial = useMemo(() => loadLayoutState(), []);
  const hasLatestReply = props.messages.length > 0 &&
    props.messages[props.messages.length - 1].role === 'assistant';

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
          <Panel id="chat" minSize="30%" style={PANEL_FILL_STYLE}>
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
          </Panel>
          {!props.isInspectorCollapsed && (
            <>
              <Separator />
              <Panel
                id="task-inspector"
                defaultSize={`${initial.inspectorSize}%`}
                minSize="15%"
                maxSize="40%"
                style={PANEL_FILL_STYLE}
              >
                <TaskInspector
                  task={props.currentTask}
                  currentRoleId={props.currentTaskRoleId}
                  onRoleSelected={props.onTaskRoleSelected}
                  onForwardLatestReply={props.onForwardLatestReply}
                  hasLatestReply={hasLatestReply}
                />
              </Panel>
            </>
          )}
        </>
      ) : (
        <Panel id="empty" minSize="30%" style={PANEL_FILL_STYLE}>
          <div className="task-mode-empty">
            <div className="task-mode-empty-content">
              <div className="task-mode-empty-icon">📋</div>
              <h2>No Task Selected</h2>
              <p>Create a new task or select an existing one from the list</p>
              <button className="task-mode-empty-button" onClick={props.onNewTask}>
                Create New Task
              </button>
            </div>
          </div>
        </Panel>
      )}
    </Group>
  );
}
