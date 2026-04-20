import React, { useEffect, useState } from 'react';
import { listTasks, deleteTask } from '../api';
import { TaskSummary } from '../types/api';
import './TaskListPanel.css';

interface TaskListPanelProps {
  onNewTaskClick: () => void;
  onTaskSelected: (task: TaskSummary) => void;
  currentTaskId: string | null;
  refreshKey?: number;
}

export default function TaskListPanel({ onNewTaskClick, onTaskSelected, currentTaskId, refreshKey }: TaskListPanelProps) {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTasks();
  }, [refreshKey]);

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

  const handleDeleteTask = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('确定要删除这个任务吗？')) {
      try {
        await deleteTask(taskId);
        await loadTasks();
      } catch (error) {
        console.error('Failed to delete task:', error);
      }
    }
  };

  return (
    <div className="task-list-panel">
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
          tasks.map((task) => (
            <div
              key={task.id}
              className={`task-list-item ${currentTaskId === task.id ? 'active' : ''}`}
              onClick={() => onTaskSelected(task)}
            >
              <div className="task-list-item-icon">📋</div>
              <div className="task-list-item-content">
                <div className="task-list-item-name">{task.name}</div>
                <div className="task-list-item-meta">
                  {task.roles.length} roles
                </div>
              </div>
              <button
                className="task-delete-button"
                onClick={(e) => handleDeleteTask(task.id, e)}
                title="删除任务"
              >
                🗑️
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
