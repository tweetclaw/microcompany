// Message types
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

// Session configuration
export interface SessionConfig {
  workingDirectory: string;
}

// Chat state
export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
}

// Tool call types
export interface ToolCall {
  tool: string;
  action: string;
  status: 'running' | 'success' | 'error';
  result?: string;
}

// App state
export interface AppState {
  isSessionInitialized: boolean;
  workingDirectory: string | null;
  messages: Message[];
  isLoading: boolean;
  inputValue: string;
  error: string | null;
}
