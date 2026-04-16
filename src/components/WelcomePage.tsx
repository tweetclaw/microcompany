import React from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWindow } from '@tauri-apps/api/window';
import logoImage from '../assets/logo.png';
import './WelcomePage.css';

interface WelcomePageProps {
  onDirectorySelected: (directory: string) => void;
}

function WelcomePage({ onDirectorySelected }: WelcomePageProps) {
  const [recentDirectories, setRecentDirectories] = React.useState<string[]>([]);
  const [isMaximized, setIsMaximized] = React.useState(false);

  React.useEffect(() => {
    // Load recent directories from localStorage
    const stored = localStorage.getItem('recentDirectories');
    if (stored) {
      try {
        setRecentDirectories(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to load recent directories:', e);
      }
    }

    // Check window maximized state
    const appWindow = getCurrentWindow();
    appWindow.isMaximized().then(setIsMaximized).catch(console.error);

    const unlisten = appWindow.onResized(() => {
      appWindow.isMaximized().then(setIsMaximized).catch(console.error);
    });

    return () => {
      unlisten.then(fn => fn()).catch(console.error);
    };
  }, []);

  const handleSelectDirectory = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Working Directory',
      });

      if (selected && typeof selected === 'string') {
        // Save to recent directories
        const updated = [selected, ...recentDirectories.filter(d => d !== selected)].slice(0, 5);
        setRecentDirectories(updated);
        localStorage.setItem('recentDirectories', JSON.stringify(updated));

        onDirectorySelected(selected);
      }
    } catch (error) {
      console.error('Failed to select directory:', error);
    }
  };

  const handleSelectRecent = (directory: string) => {
    onDirectorySelected(directory);
  };

  const getDirectoryName = (path: string) => {
    const parts = path.split('/');
    return parts[parts.length - 1] || path;
  };

  const getParentPath = (path: string) => {
    const parts = path.split('/');
    return parts.slice(0, -1).join('/') || '~';
  };

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
    <div className="welcome-page">
      <div className="welcome-window-controls">
        <button className="welcome-window-btn minimize-btn" onClick={handleMinimize} title="最小化">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
        </button>

        <button className="welcome-window-btn maximize-btn" onClick={handleMaximize} title={isMaximized ? "还原" : "最大化"}>
          <svg width="12" height="12" viewBox="0 0 12 12">
            {isMaximized ? (
              <>
                <rect x="3" y="1" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M 1 4 L 1 11 L 8 11" fill="none" stroke="currentColor" strokeWidth="1.5"/>
              </>
            ) : (
              <rect x="2" y="2" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.5"/>
            )}
          </svg>
        </button>

        <button className="welcome-window-btn close-btn" onClick={handleClose} title="关闭">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <line x1="3" y1="3" x2="9" y2="9" stroke="currentColor" strokeWidth="1.5"/>
            <line x1="9" y1="3" x2="3" y2="9" stroke="currentColor" strokeWidth="1.5"/>
          </svg>
        </button>
      </div>
      <div className="welcome-content">
        <div className="welcome-header">
          <div className="welcome-logo">
            <img src={logoImage} alt="MicroCompany Logo" width="120" height="120" />
          </div>
          <h1 className="welcome-title">MicroCompany</h1>
          <p className="welcome-subtitle">AI-Powered Development Assistant</p>
        </div>

        <div className="welcome-actions">
          <div className="action-section">
            <h2>Start</h2>
            <button className="action-button primary" onClick={handleSelectDirectory}>
              <span className="action-icon">📁</span>
              <div className="action-text">
                <div className="action-title">Open Folder...</div>
                <div className="action-description">Select a working directory to begin</div>
              </div>
            </button>
          </div>

          {recentDirectories.length > 0 && (
            <div className="action-section">
              <h2>Recent</h2>
              <div className="recent-list">
                {recentDirectories.map((dir, index) => (
                  <button
                    key={index}
                    className="recent-item"
                    onClick={() => handleSelectRecent(dir)}
                  >
                    <span className="recent-icon">📂</span>
                    <div className="recent-text">
                      <div className="recent-name">{getDirectoryName(dir)}</div>
                      <div className="recent-path">{getParentPath(dir)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default WelcomePage;
