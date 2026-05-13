import React, { useEffect, useRef, useState } from 'react';
import { listTasks, deleteTask } from '../api';
import { TaskSummary } from '../types/api';
import './TaskListPanel.css';

interface TaskListPanelProps {
  onNewTaskClick: () => void;
  onTaskSelected: (task: TaskSummary) => void;
  onTaskDeleted?: (taskId: string) => void;
  currentTaskId: string | null;
  refreshKey?: number;
}

export default function TaskListPanel({ onNewTaskClick, onTaskSelected, onTaskDeleted, currentTaskId, refreshKey }: TaskListPanelProps) {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingDeleteTaskId, setPendingDeleteTaskId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadTasks();
  }, [refreshKey]);

  useEffect(() => {
    if (!pendingDeleteTaskId) {
      return;
    }

    const handlePointerDownOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setPendingDeleteTaskId(null);
      }
    };

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPendingDeleteTaskId(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDownOutside);
    document.addEventListener('keydown', handleEscapeKey);
    return () => {
      document.removeEventListener('mousedown', handlePointerDownOutside);
      document.removeEventListener('keydown', handleEscapeKey);
    };
  }, [pendingDeleteTaskId]);

  const loadTasks = async () => {
    try {
      setLoading(true);
      setTasks(await listTasks());
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTask = async (taskId: string, event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setPendingDeleteTaskId(null);

    try {
      await deleteTask(taskId);
      setTasks((current) => current.filter((task) => task.id !== taskId));
      onTaskDeleted?.(taskId);
    } catch (error) {
      console.error('[TaskListPanel] Failed to delete task:', error);
      window.alert('删除任务失败');
    }
  };

  return (
    <div className="task-list-panel" ref={panelRef}>
      <div className="task-list-header">
        <button className="new-task-button" onClick={onNewTaskClick}>
          <span className="new-task-icon">➕</span>
          <span>新建任务</span>
        </button>
      </div>

      <div className="task-list-content">
        {loading ? (
          <div className="task-list-loading">Loading...</div>
        ) : (
          tasks.map((task) => {
            const isPendingDelete = pendingDeleteTaskId === task.id;
            return (
              <div
                key={task.id}
                className={`task-list-item ${currentTaskId === task.id ? 'active' : ''}`}
                onClick={() => onTaskSelected(task)}
              >
                <div className="task-list-item-content">
                  <div className="task-list-item-name">{task.name}</div>
                </div>
                <div className="task-list-item-actions">
                  {isPendingDelete ? (
                    <div className="task-list-delete-confirm" onClick={(event) => event.stopPropagation()}>
                      <span>删除？</span>
                      <button type="button" className="confirm" onClick={(event) => handleDeleteTask(task.id, event)}>
                        是
                      </button>
                      <button type="button" className="cancel" onClick={(event) => { event.stopPropagation(); setPendingDeleteTaskId(null); }}>
                        否
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="task-list-delete-button"
                      aria-label={`删除任务 ${task.name}`}
                      title="删除任务"
                      onClick={(event) => {
                        event.stopPropagation();
                        setPendingDeleteTaskId(task.id);
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
