import { invoke } from '@tauri-apps/api/core';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogPayload {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
}

/**
 * Send frontend logs to backend so they appear in dev.log
 */
async function logToBackend(level: LogLevel, message: string, context?: Record<string, unknown>): Promise<void> {
  try {
    await invoke('log_from_frontend', {
      payload: {
        level,
        message,
        context: context || null,
      } as LogPayload,
    });
  } catch (error) {
    // Fallback to console if backend logging fails
    console.error('[frontendLogger] Failed to log to backend:', error);
  }
}

export const frontendLogger = {
  info: (message: string, context?: Record<string, unknown>) => {
    console.log(message, context);
    logToBackend('info', message, context);
  },

  warn: (message: string, context?: Record<string, unknown>) => {
    console.warn(message, context);
    logToBackend('warn', message, context);
  },

  error: (message: string, context?: Record<string, unknown>) => {
    console.error(message, context);
    logToBackend('error', message, context);
  },

  debug: (message: string, context?: Record<string, unknown>) => {
    console.debug(message, context);
    logToBackend('debug', message, context);
  },
};
