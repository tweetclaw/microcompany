// Message types
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
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

// App state
export interface AppState {
  isSessionInitialized: boolean;
  workingDirectory: string | null;
  messages: Message[];
  isLoading: boolean;
  inputValue: string;
  error: string | null;
}
