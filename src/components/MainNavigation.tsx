import React from 'react';
import './MainNavigation.css';

export type NavigationMode = 'normal' | 'task';

interface MainNavigationProps {
  currentMode: NavigationMode;
  onModeChange: (mode: NavigationMode) => void;
  onSettingsClick: () => void;
  onSearchClick: () => void;
}

export default function MainNavigation({ currentMode, onModeChange, onSettingsClick, onSearchClick }: MainNavigationProps) {
  return (
    <div className="main-navigation">
      <div className="main-navigation-items">
        <button
          className={`main-navigation-item ${currentMode === 'normal' ? 'active' : ''}`}
          onClick={() => onModeChange('normal')}
          title="Normal Mode - Sessions"
        >
          <span className="main-navigation-icon">💬</span>
        </button>
        <button
          className={`main-navigation-item ${currentMode === 'task' ? 'active' : ''}`}
          onClick={() => onModeChange('task')}
          title="Task Mode - Multi-role Tasks"
        >
          <span className="main-navigation-icon">📋</span>
        </button>
      </div>
      <div className="main-navigation-footer">
        <button
          className="main-navigation-item"
          onClick={onSearchClick}
          title="Search Messages (Cmd+K)"
        >
          <span className="main-navigation-icon">🔍</span>
        </button>
        <button
          className="main-navigation-item"
          onClick={onSettingsClick}
          title="Settings"
        >
          <span className="main-navigation-icon">⚙️</span>
        </button>
      </div>
    </div>
  );
}
