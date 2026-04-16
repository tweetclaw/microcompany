import React, { useEffect, useMemo, useRef, useState } from 'react';
import MessageItem from './MessageItem';
import { Message, ProcessTimelineItem } from '../types';
import './MessageList.css';

interface MessageListProps {
  messages: Message[];
  isBusy: boolean;
  processTimeline: ProcessTimelineItem[];
}

function MessageList({ messages, isBusy, processTimeline }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isBusy, processTimeline]);

  const recentTimeline = useMemo(() => processTimeline.slice(-30), [processTimeline]);

  return (
    <div className="message-list">
      <div className="message-list-content">
        {processTimeline.length > 0 && (
          <div className="process-timeline-card">
            <button
              className="process-timeline-header"
              onClick={() => setTimelineCollapsed((prev) => !prev)}
              type="button"
            >
              <span>过程事件流</span>
              <span className="process-timeline-meta">{timelineCollapsed ? '展开' : '折叠'}</span>
            </button>
            {!timelineCollapsed && (
              <div className="process-timeline-body">
                {recentTimeline.map((item) => (
                  <div key={item.id} className="process-timeline-item">
                    <div className="process-timeline-time">
                      {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                    <div className="process-timeline-text">{item.text}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((message) => (
          <MessageItem key={message.id} message={message} />
        ))}

        {isBusy && (
          <div className="loading-indicator">
            <span className="loading-dot"></span>
            <span className="loading-dot"></span>
            <span className="loading-dot"></span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}

export default MessageList;
