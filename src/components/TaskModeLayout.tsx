import React from 'react';
import TaskListPanel from './TaskListPanel';
import ChatInterface from './ChatInterface';
import TaskInspector from './TaskInspector';
import { Message, Task, TaskSummary, ProviderConfig } from '../types';
import './TaskModeLayout.css';

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
  taskListRefreshKey: number;
  onSettingsClick: () => void;
  isSessionListCollapsed?: boolean;
  isInspectorCollapsed?: boolean;
  isTerminalCollapsed?: boolean;
}

export default function TaskModeLayout(props: TaskModeLayoutProps) {
  const hasLatestReply = props.messages.length > 0 &&
    props.messages[props.messages.length - 1].role === 'assistant';

  return (
    <div className="task-mode-layout">
      {!props.isSessionListCollapsed && (
        <TaskListPanel
          onNewTaskClick={props.onNewTask}
          onTaskSelected={props.onTaskSelected}
          currentTaskId={props.currentTask?.id || null}
          refreshKey={props.taskListRefreshKey}
        />
      )}
      {props.currentTask ? (
        <>
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
          {!props.isInspectorCollapsed && (
            <TaskInspector
              task={props.currentTask}
              currentRoleId={props.currentTaskRoleId}
              onRoleSelected={props.onTaskRoleSelected}
              onForwardLatestReply={props.onForwardLatestReply}
              hasLatestReply={hasLatestReply}
            />
          )}
        </>
      ) : (
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
      )}
    </div>
  );
}
