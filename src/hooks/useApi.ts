import { useState, useEffect, useCallback } from 'react';
import * as api from '../api';
import type {
  TaskSummary,
  Task,
  SessionSummary,
  Message,
  MessageSearchResult,
  Statistics,
  TaskStatistics,
  BackupInfo,
} from '../types/api';

// Task hooks
export function useTasks(refreshKey?: number) {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.listTasks();
      setTasks(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [refreshKey, loadTasks]);

  const retry = useCallback(() => {
    loadTasks();
  }, [loadTasks]);

  return { tasks, loading, error, reload: loadTasks, retry };
}

export function useTask(taskId: string | null) {
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) {
      setTask(null);
      return;
    }

    const loadTask = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getTask(taskId);
        setTask(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load task');
      } finally {
        setLoading(false);
      }
    };

    loadTask();
  }, [taskId]);

  return { task, loading, error };
}

// Session hooks
export function useSessions(refreshKey?: number) {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.listNormalSessions();
      setSessions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [refreshKey, loadSessions]);

  const retry = useCallback(() => {
    loadSessions();
  }, [loadSessions]);

  return { sessions, loading, error, reload: loadSessions, retry };
}

// Message hooks
export function useMessages(sessionId: string | null, limit?: number, offset?: number) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMessages = useCallback(async () => {
    if (!sessionId) {
      setMessages([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await api.getMessages(sessionId, limit, offset);
      setMessages(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [sessionId, limit, offset]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const retry = useCallback(() => {
    loadMessages();
  }, [loadMessages]);

  return { messages, loading, error, reload: loadMessages, retry };
}

// Search hook
export function useMessageSearch(query: string, limit?: number) {
  const [results, setResults] = useState<MessageSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async () => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await api.searchMessages(query, limit);
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [query, limit]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    search();
  }, [query, limit, search]);

  return { results, loading, error, search };
}

// Statistics hooks
export function useStatistics() {
  const [stats, setStats] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getStatistics();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load statistics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const retry = useCallback(() => {
    loadStats();
  }, [loadStats]);

  return { stats, loading, error, reload: loadStats, retry };
}

export function useTaskStatistics(taskId: string | null) {
  const [stats, setStats] = useState<TaskStatistics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!taskId) {
      setStats(null);
      return;
    }

    const loadStats = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getTaskStatistics(taskId);
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load task statistics');
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [taskId]);

  return { stats, loading, error };
}

// Backup hooks
export function useBackups(refreshKey?: number) {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBackups = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.listBackups();
      setBackups(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load backups');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBackups();
  }, [refreshKey, loadBackups]);

  const retry = useCallback(() => {
    loadBackups();
  }, [loadBackups]);

  return { backups, loading, error, reload: loadBackups, retry };
}
