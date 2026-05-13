import { useRef, useCallback, useEffect, useState } from 'react';

const DEFAULT_THRESHOLD = 100; // 距底部 100px 以内视为"在底部"，与 PRD 保持一致

/** 可选配置项 */
export interface UseScrollControlOptions {
  /**
   * 外部注入的滚动容器 ref（可选）。
   * 提供此参数时 hook 使用外部 ref，否则内部创建新 ref。
   * 主要用途：单元测试时注入 mock 容器，无需真实 DOM。
   */
  containerRef?: React.RefObject<HTMLDivElement | null>;
  /**
   * "视为在底部"的距离阈值（px），默认 100。
   * 可按设备类型覆盖：移动端建议 120，桌面端可保持 100。
   */
  threshold?: number;
}

export interface ScrollControlResult {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isAtBottom: boolean;
  hasNewMessage: boolean;
  setHasNewMessage: React.Dispatch<React.SetStateAction<boolean>>;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

export function useScrollControl(
  options: UseScrollControlOptions = {}
): ScrollControlResult {
  const { threshold = DEFAULT_THRESHOLD } = options;

  // 若外部传入 ref 则复用，否则内部创建（保持向后兼容）
  const internalRef = useRef<HTMLDivElement>(null);
  const containerRef = options.containerRef ?? internalRef;

  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasNewMessage, setHasNewMessage] = useState(false);

  // 监听滚动位置，判断用户是否在底部
  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom <= threshold;
    setIsAtBottom(atBottom);
    if (atBottom) setHasNewMessage(false);
  }, [containerRef, threshold]);

  // 滚动到底部（用于按钮点击和自动滚动）
  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      const el = containerRef.current;
      if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior });
    },
    [containerRef]
  );

  // 注册滚动监听，返回清理函数
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [containerRef, handleScroll]);

  return {
    containerRef,
    isAtBottom,
    hasNewMessage,
    setHasNewMessage,
    scrollToBottom,
  };
}
