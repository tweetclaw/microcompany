import { useState, useEffect, useCallback, useRef } from 'react';

interface UseScrollControlOptions {
  /** 外部传入的容器 ref（可选）；不传则内部创建 */
  containerRef?: React.RefObject<HTMLDivElement>;
  /** 判定"在底部"的距离阈值（px），默认 100 */
  threshold?: number;
}

export function useScrollControl(options: UseScrollControlOptions = {}) {
  const {
    containerRef: externalContainerRef,
    threshold = 100,
  } = options;

  const internalContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = externalContainerRef || internalContainerRef;

  const [isAtBottom, setIsAtBottom] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  // 使用 ref 避免闭包陷阱，确保 handleScroll 和 onNewMessage 始终读取最新值
  const isAtBottomRef = useRef(true);
  const lastMessageCountRef = useRef(0);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom < threshold;

    setIsAtBottom(atBottom);
    isAtBottomRef.current = atBottom;

    if (atBottom) {
      setUnreadCount(0);
    }
  }, [threshold, containerRef]);

  // 绑定/解绑 scroll 事件
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll, containerRef]);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'auto') => {
      const el = containerRef.current;
      if (!el) return;

      el.scrollTo({
        top: el.scrollHeight,
        behavior,
      });

      setIsAtBottom(true);
      isAtBottomRef.current = true;
      setUnreadCount(0);
    },
    [containerRef],
  );

  /**
   * 当有新消息时调用。自动判断是否滚动到底部。
   * @param currentMessageCount 当前消息总数
   */
  const onNewMessage = useCallback(
    (currentMessageCount: number) => {
      if (isAtBottomRef.current) {
        // 使用 rAF 确保在浏览器下一次重绘时滚动，性能更优
        requestAnimationFrame(() => {
          scrollToBottom('auto');
        });
      } else {
        // 用户不在底部时累计未读消息数
        const newUnread =
          currentMessageCount - lastMessageCountRef.current;
        if (newUnread > 0) {
          setUnreadCount((prev) => prev + newUnread);
        }
      }
      lastMessageCountRef.current = currentMessageCount;
    },
    [scrollToBottom],
  );

  /** 用户手动滚动到底部后清除未读计数 */
  const clearUnread = useCallback(() => {
    setUnreadCount(0);
  }, []);

  return {
    isAtBottom,
    unreadCount,
    scrollToBottom,
    onNewMessage,
    clearUnread,
    /** 当外部未传入 containerRef 时，需要将此 ref 绑定到滚动容器 */
    containerRef: internalContainerRef,
  };
}
