import React, { useState, useRef, useEffect } from 'react';
import './ModelDropdown.css';

interface ModelOption {
  value: string;
  providerId: string;
  providerName: string;
  model: string;
}

interface ModelDropdownProps {
  modelOptions: ModelOption[];
  onSelectModel: (value: string) => void;
  onCancel: () => void;
  triggerRect: DOMRect;
}

function ModelDropdown({
  modelOptions,
  onSelectModel,
  onCancel,
  triggerRect,
}: ModelDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onCancel();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onCancel]);

  const dropdownStyle: React.CSSProperties = {
    position: 'fixed',
    top: `${triggerRect.bottom + 4}px`,
    right: `${window.innerWidth - triggerRect.right}px`,
  };

  return (
    <div className="model-dropdown" ref={dropdownRef} style={dropdownStyle}>
      <div className="model-dropdown-header">选择模型</div>
      <div className="model-dropdown-list">
        {modelOptions.map((option) => (
          <button
            key={option.value}
            className="model-dropdown-item"
            onClick={() => onSelectModel(option.value)}
          >
            <span className="model-dropdown-provider">{option.providerName}</span>
            <span className="model-dropdown-model">{option.model}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default ModelDropdown;
