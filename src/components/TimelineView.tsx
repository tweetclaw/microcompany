import React from 'react';
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

  return (
    <div className="timeline-view">
      {timeline.map((item) => {
        if (item.type === 'output') {
          return (
            <div key={item.id} className="timeline-item timeline-output">
              <div className="timeline-marker output-marker">💬</div>
              <div className="timeline-content">
                <MarkdownRenderer content={item.content || ''} />
              </div>
            </div>
          );
        }

        if (item.type === 'tool_call') {
          return (
            <div key={item.id} className="timeline-item timeline-tool">
              <div className="timeline-marker tool-marker">🔧</div>
              <div className="timeline-content">
                <div className="tool-header">
                  <span className="tool-name">{item.tool}</span>
                  <span className={`tool-status status-${item.status}`}>
                    {item.status === 'running' && '⏳ 执行中'}
                    {item.status === 'success' && '✓ 成功'}
                    {item.status === 'error' && '✗ 失败'}
                  </span>
                </div>
                <div className="tool-action">{item.action}</div>
                {item.result && item.status !== 'running' && (
                  <details className="tool-result">
                    <summary>查看结果</summary>
                    <pre>{item.result}</pre>
                  </details>
                )}
              </div>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
};
