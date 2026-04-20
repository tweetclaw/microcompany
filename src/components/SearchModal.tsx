import React, { useState, useEffect, useRef } from 'react';
import { useMessageSearch } from '../hooks/useApi';
import './SearchModal.css';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResultClick: (sessionId: string, sessionType: string, taskId: string | null) => void;
}

export default function SearchModal({ isOpen, onClose, onResultClick }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { results, loading, error } = useMessageSearch(debouncedQuery, 20);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  const handleResultClick = (result: typeof results[0]) => {
    const sessionId = result.message.session_id;
    const sessionType = result.session_type;
    // For task sessions, pass the session_id as taskId to trigger task loading
    // The parent component will fetch the full session to get the actual task_id
    const taskId = result.session_type === 'task' ? sessionId : null;

    onResultClick(sessionId, sessionType, taskId);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="search-modal-overlay" onClick={onClose}>
      <div className="search-modal" onClick={(e) => e.stopPropagation()}>
        <div className="search-modal-header">
          <input
            ref={inputRef}
            type="text"
            className="search-modal-input"
            placeholder="Search messages..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="search-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="search-modal-content">
          {loading && <div className="search-modal-loading">Searching...</div>}

          {error && <div className="search-modal-error">Search failed: {error}</div>}

          {!loading && !error && query && results.length === 0 && (
            <div className="search-modal-empty">No results found for "{query}"</div>
          )}

          {!loading && !error && !query && (
            <div className="search-modal-empty">Type to search messages...</div>
          )}

          {!loading && !error && results.length > 0 && (
            <div className="search-results">
              {results.map((result, index) => (
                <div
                  key={`${result.message.id}-${index}`}
                  className="search-result-item"
                  onClick={() => handleResultClick(result)}
                >
                  <div className="search-result-header">
                    <span className="search-result-session">{result.session_name}</span>
                    <span className="search-result-type">{result.session_type}</span>
                    {result.task_name && (
                      <span className="search-result-task">Task: {result.task_name}</span>
                    )}
                    {result.role_name && (
                      <span className="search-result-role">Role: {result.role_name}</span>
                    )}
                  </div>
                  <div
                    className="search-result-snippet"
                    dangerouslySetInnerHTML={{ __html: result.snippet }}
                  />
                  <div className="search-result-meta">
                    {new Date(result.message.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
