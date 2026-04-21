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
      const loadedTasks = await listTasks();
      setTasks(loadedTasks);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTaskClick = (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDeleteTaskId(taskId);
  };

  const handleConfirmDeleteTask = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteTask(taskId);
      setPendingDeleteTaskId(null);
      if (onTaskDeleted) {
        onTaskDeleted(taskId);
      }
      await loadTasks();
    } catch (error) {
      console.error('Failed to delete task:', error);
      alert(`删除任务失败: ${error}`);
    }
  };

  const handleCancelDeleteTask = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPendingDeleteTaskId(null);
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
        ) : tasks.length === 0 ? (
          <div className="task-list-empty">No tasks yet</div>
        ) : (
          tasks.map((task) => {
            const isPendingDelete = pendingDeleteTaskId === task.id;

            return (
              <div
                key={task.id}
                className={`task-list-item ${currentTaskId === task.id ? 'active' : ''}`}
                onClick={() => onTaskSelected(task)}
              >
                <div className="task-list-item-icon">📋</div>
                <div className="task-list-item-content">
                  <div className="task-list-item-name">{task.name}</div>
                  <div className="task-list-item-meta">
                    {task.role_count} roles
                  </div>
                </div>
                {isPendingDelete ? (
                  <div className="task-delete-confirm" onClick={(e) => e.stopPropagation()}>
                    <span className="task-delete-confirm-text">确认删除？</span>
                    <button
                      className="task-delete-confirm-button confirm"
                      onClick={(e) => handleConfirmDeleteTask(task.id, e)}
                      title="确认删除任务"
                    >
                      确认
                    </button>
                    <button
                      className="task-delete-confirm-button cancel"
                      onClick={handleCancelDeleteTask}
                      title="取消删除任务"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <button
                    className="task-delete-button"
                    onClick={(e) => handleDeleteTaskClick(task.id, e)}
                    title="删除任务"
                  >
                    🗑️
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
