export interface LayoutState {
  isSidebarCollapsed: boolean;
  isInspectorCollapsed: boolean;
  isTerminalCollapsed: boolean;
}

const STORAGE_KEY = 'microcompany-layout-state';

export function loadLayoutState(): LayoutState {
  if (typeof window === 'undefined') {
    return {
      isSidebarCollapsed: false,
      isInspectorCollapsed: false,
      isTerminalCollapsed: false,
    };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        isSidebarCollapsed: false,
        isInspectorCollapsed: false,
        isTerminalCollapsed: false,
      };
    }

    const parsed = JSON.parse(raw) as Partial<LayoutState>;
    return {
      isSidebarCollapsed: Boolean(parsed.isSidebarCollapsed),
      isInspectorCollapsed: Boolean(parsed.isInspectorCollapsed),
      isTerminalCollapsed: Boolean(parsed.isTerminalCollapsed),
    };
  } catch {
    return {
      isSidebarCollapsed: false,
      isInspectorCollapsed: false,
      isTerminalCollapsed: false,
    };
  }
}

export function saveLayoutState(state: LayoutState) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
