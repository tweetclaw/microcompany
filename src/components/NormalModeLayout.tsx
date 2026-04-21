import { useMemo, type CSSProperties } from 'react';
import { Group, Panel, Separator, type Layout } from 'react-resizable-panels';
import SessionListPanel from './SessionListPanel';
import ChatInterface from './ChatInterface';
import { Message, ProviderConfig } from '../types';
import { loadLayoutState, saveLayoutState } from '../utils/layoutState';
import './NormalModeLayout.css';
import './ResizeHandle.css';

const PANEL_FILL_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

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
  const initial = useMemo(() => loadLayoutState(), []);

  const handleLayoutChanged = (layout: Layout) => {
    const sidebarSize = layout['session-list'];
    if (typeof sidebarSize !== 'number' || !Number.isFinite(sidebarSize)) return;
    const current = loadLayoutState();
    if (Math.abs(current.sidebarSize - sidebarSize) < 0.01) return;
    saveLayoutState({ ...current, sidebarSize });
  };

  const chatPanel = (
    <Panel id="chat" minSize="30%" style={PANEL_FILL_STYLE}>
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
    </Panel>
  );

  return (
    <Group
      orientation="horizontal"
      className="normal-mode-layout"
      onLayoutChanged={handleLayoutChanged}
    >
      {!props.isSessionListCollapsed && (
        <>
          <Panel
            id="session-list"
            defaultSize={`${initial.sidebarSize}%`}
            minSize="10%"
            maxSize="40%"
            style={PANEL_FILL_STYLE}
          >
            <SessionListPanel
              workingDirectory={props.workingDirectory}
              currentSessionId={props.currentSessionId}
              sessionListRefreshKey={props.sessionListRefreshKey}
              availableProviders={props.availableProviders}
              onSessionSelected={props.onSessionSelected}
              onSessionDeleted={props.onSessionDeleted}
              onNewChatWithModel={props.onNewChatWithModel}
            />
          </Panel>
          <Separator />
        </>
      )}
      {chatPanel}
    </Group>
  );
}
