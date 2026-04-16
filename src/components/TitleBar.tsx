import React, { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import './TitleBar.css';

interface TitleBarProps {
  onToggleSessionList: () => void;
  onToggleInspector: () => void;
  onToggleTerminal: () => void;
  isSessionListCollapsed: boolean;
  isInspectorCollapsed: boolean;
  isTerminalCollapsed: boolean;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  onToggleSessionList,
  onToggleInspector,
  onToggleTerminal,
  isSessionListCollapsed,
  isInspectorCollapsed,
  isTerminalCollapsed,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const appWindow = getCurrentWindow();
    
    // 检查初始最大化状态
    appWindow.isMaximized().then(setIsMaximized).catch(console.error);
    
    // 监听窗口大小变化
    const unlisten = appWindow.onResized(() => {
      appWindow.isMaximized().then(setIsMaximized).catch(console.error);
    });
    
    return () => {
      unlisten.then(fn => fn()).catch(console.error);
    };
  }, []);

  const handleMinimize = async () => {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.minimize();
    } catch (error) {
      console.error('Failed to minimize window:', error);
    }
  };

  const handleMaximize = async () => {
    try {
      const appWindow = getCurrentWindow();
      const maximized = await appWindow.isMaximized();
      
      if (maximized) {
        await appWindow.unmaximize();
      } else {
        await appWindow.maximize();
      }
      
      setIsMaximized(!maximized);
    } catch (error) {
      console.error('Failed to toggle maximize window:', error);
    }
  };

  const handleClose = async () => {
    try {
      const appWindow = getCurrentWindow();
      await appWindow.close();
    } catch (error) {
      console.error('Failed to close window:', error);
    }
  };

  return (
    <div className="title-bar">
      <div className="title-bar-left">
        <span className="app-name">MicroCompany</span>
      </div>
      
      <div className="title-bar-drag-region" data-tauri-drag-region></div>
      
      <div className="title-bar-right">
        <div className="panel-controls">
          <button
            className={`panel-toggle-btn ${isSessionListCollapsed ? 'collapsed' : ''}`}
            onClick={onToggleSessionList}
            title="切换会话列表"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="4" height="12" rx="1" stroke="currentColor" strokeWidth="1.5"/>
              <rect x="8" y="2" width="6" height="12" rx="1" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
          </button>
          
          <button
            className={`panel-toggle-btn ${isInspectorCollapsed ? 'collapsed' : ''}`}
            onClick={onToggleInspector}
            title="切换检查器"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="6" height="12" rx="1" stroke="currentColor" strokeWidth="1.5"/>
              <rect x="10" y="2" width="4" height="12" rx="1" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
          </button>
          
          <button
            className={`panel-toggle-btn ${isTerminalCollapsed ? 'collapsed' : ''}`}
            onClick={onToggleTerminal}
            title="切换终端"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="2" width="12" height="6" rx="1" stroke="currentColor" strokeWidth="1.5"/>
              <rect x="2" y="10" width="12" height="4" rx="1" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
          </button>
        </div>

        <div className="window-controls">
          <button className="window-btn minimize-btn" onClick={handleMinimize} title="最小化">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
          </button>
          
          <button className="window-btn maximize-btn" onClick={handleMaximize} title="最大化">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="2" y="2" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
          </button>
          
          <button className="window-btn close-btn" onClick={handleClose} title="关闭">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <line x1="3" y1="3" x2="9" y2="9" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="9" y1="3" x2="3" y2="9" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
