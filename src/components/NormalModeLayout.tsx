import React from 'react';
import SessionListPanel from './SessionListPanel';
import ChatInterface from './ChatInterface';
import { Message, ProviderConfig } from '../types';
import './NormalModeLayout.css';

interface NormalModeLayoutProps {
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
  onSettingsClick: () => void;
  isSessionListCollapsed?: boolean;
  isInspectorCollapsed?: boolean;
  isTerminalCollapsed?: boolean;
}

export default function NormalModeLayout(props: NormalModeLayoutProps) {
  return (
    <div className="normal-mode-layout">
      {!props.isSessionListCollapsed && (
        <SessionListPanel
          workingDirectory={props.workingDirectory}
          currentSessionId={props.currentSessionId}
          sessionListRefreshKey={props.sessionListRefreshKey}
          availableProviders={props.availableProviders}
          onSessionSelected={props.onSessionSelected}
          onSessionDeleted={props.onSessionDeleted}
          onNewChatWithModel={props.onNewChatWithModel}
        />
      )}
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
        hideInspector={false}
        hideTitleBar={true}
        hideToolbar={true}
        externalInspectorCollapsed={props.isInspectorCollapsed}
        externalTerminalCollapsed={props.isTerminalCollapsed}
      />
    </div>
  );
}
