import React, { useState } from 'react';
import { TimelineItem } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';
import './TimelineView.css';

interface TimelineViewProps {
  timeline: TimelineItem[];
}

export const TimelineView: React.FC<TimelineViewProps> = ({ timeline }) => {
  if (!timeline || timeline.length === 0) {
    return null;
  }

  // Sort timeline items by timestamp to ensure chronological order
  const sortedTimeline = [...timeline].sort((a, b) => a.timestamp - b.timestamp);

  return (
    <div className="timeline-view">
      {sortedTimeline.map((item) => {
        if (item.type === 'thinking') {
          return <ThinkingItem key={item.id} item={item} />;
        }

        if (item.type === 'tool_call') {
          return <ToolCallItem key={item.id} item={item} />;
        }

        if (item.type === 'output') {
          return <OutputItem key={item.id} item={item} />;
        }

        return null;
      })}
    </div>
  );
};

const ThinkingItem: React.FC<{ item: TimelineItem }> = ({ item }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!item.content || item.content.trim() === '') {
    return (
      <div className="timeline-item timeline-thinking">
        <div className="timeline-marker thinking-marker" aria-hidden="true">思</div>
        <div className="timeline-content">
          <div className="thinking-label">AI 正在思考...</div>
        </div>
      </div>
    );
  }

  const preview = item.content.split('\n')[0].slice(0, 100);
  const hasMore = item.content.length > 100 || item.content.includes('\n');

  return (
    <div className="timeline-item timeline-thinking">
      <div className="timeline-marker thinking-marker" aria-hidden="true">思</div>
      <div className="timeline-content">
        <button
          type="button"
          className="thinking-header"
          onClick={() => hasMore && setIsExpanded(!isExpanded)}
          disabled={!hasMore}
        >
          <span className="thinking-label">AI 思考</span>
          {hasMore && (
            <span className="thinking-toggle">
              {isExpanded ? '▼' : '▶'} {isExpanded ? '收起' : '展开'}
            </span>
          )}
        </button>
        <div className={`thinking-content ${isExpanded ? 'expanded' : 'collapsed'}`}>
          {isExpanded ? (
            <MarkdownRenderer content={item.content} />
          ) : (
            <div className="thinking-preview">{preview}{hasMore && '...'}</div>
          )}
        </div>
      </div>
    </div>
  );
};

const ToolCallItem: React.FC<{ item: TimelineItem }> = ({ item }) => {
  const [isResultExpanded, setIsResultExpanded] = useState(false);

  return (
    <div className="timeline-item timeline-tool">
      <div className="timeline-marker tool-marker" aria-hidden="true">工</div>
      <div className="timeline-content">
        <div className="tool-header">
          <span className="tool-name">{item.tool}</span>
          <span className={`tool-status status-${item.status}`}>
            {item.status === 'running' && '执行中'}
            {item.status === 'success' && '成功'}
            {item.status === 'error' && '失败'}
          </span>
        </div>
        {item.action && <div className="tool-action">{item.action}</div>}
        {item.result && item.status !== 'running' && (
          <div className="tool-result">
            <button
              type="button"
              className="tool-result-toggle"
              onClick={() => setIsResultExpanded(!isResultExpanded)}
            >
              {isResultExpanded ? '▼' : '▶'} 查看结果
            </button>
            {isResultExpanded && (
              <pre className="tool-result-content">{item.result}</pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const OutputItem: React.FC<{ item: TimelineItem }> = ({ item }) => {
  if (!item.content) {
    return null;
  }

  return (
    <div className="timeline-item timeline-output">
      <div className="timeline-marker output-marker">💬</div>
      <div className="timeline-content">
        <MarkdownRenderer content={item.content} />
      </div>
    </div>
  );
};
