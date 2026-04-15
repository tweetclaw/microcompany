import React from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import './WelcomePage.css';

interface WelcomePageProps {
  onDirectorySelected: (directory: string) => void;
}

function WelcomePage({ onDirectorySelected }: WelcomePageProps) {
  const [recentDirectories, setRecentDirectories] = React.useState<string[]>([]);

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

  return (
    <div className="welcome-page">
      <div className="welcome-content">
        <div className="welcome-header">
          <div className="welcome-logo">
            <svg width="80" height="80" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="gradient1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#667eea" />
                  <stop offset="100%" stopColor="#764ba2" />
                </linearGradient>
                <linearGradient id="gradient2" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#f093fb" />
                  <stop offset="100%" stopColor="#f5576c" />
                </linearGradient>
              </defs>
              <circle cx="100" cy="100" r="90" fill="url(#gradient1)" opacity="0.2"/>
              <path d="M60 100 L90 130 L140 70" stroke="url(#gradient2)" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
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
