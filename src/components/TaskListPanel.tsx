import React from 'react';
import './TaskListPanel.css';

interface TaskListPanelProps {
  onNewTaskClick: () => void;
}

export default function TaskListPanel({ onNewTaskClick }: TaskListPanelProps) {
  return (
    <div className="task-list-panel">
      <div className="task-list-header">
        <button className="new-task-button" onClick={onNewTaskClick}>
          <span className="new-task-icon">➕</span>
          <span>新建任务</span>
        </button>
      </div>
      <div className="task-list-content">
        {/* Task list will be implemented here */}
      </div>
    </div>
  );
}
