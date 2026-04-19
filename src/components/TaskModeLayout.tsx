import React from 'react';
import TaskListPanel from './TaskListPanel';
import ChatInterface from './ChatInterface';
import TaskInspector from './TaskInspector';
import { Message, Task, ProviderConfig } from '../types';
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
  onMessagesChange: (messages: Message[]) => void;
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
}

export default function TaskModeLayout(props: TaskModeLayoutProps) {
  const hasLatestReply = props.messages.length > 0 &&
    props.messages[props.messages.length - 1].role === 'assistant';

  return (
    <div className="task-mode-layout">
      <TaskListPanel onNewTaskClick={props.onNewTask} />
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
        hideSidebar={true}
      />
      {props.currentTask && (
        <TaskInspector
          task={props.currentTask}
          currentRoleId={props.currentTaskRoleId}
          onRoleSelected={props.onTaskRoleSelected}
          onForwardLatestReply={props.onForwardLatestReply}
          hasLatestReply={hasLatestReply}
        />
      )}
    </div>
  );
}
