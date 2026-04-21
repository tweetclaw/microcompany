export interface LayoutState {
  isSidebarCollapsed: boolean;
  isInspectorCollapsed: boolean;
  isTerminalCollapsed: boolean;
  sidebarSize: number;
  inspectorSize: number;
  terminalSize: number;
}

const STORAGE_KEY = 'microcompany-layout-state';

const DEFAULT_STATE: LayoutState = {
  isSidebarCollapsed: false,
  isInspectorCollapsed: false,
  isTerminalCollapsed: false,
  sidebarSize: 18,
  inspectorSize: 22,
  terminalSize: 30,
};

function sanitizeSize(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  if (value < 5) return fallback;
  if (value > 80) return fallback;
  return value;
}

export function loadLayoutState(): LayoutState {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_STATE };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_STATE };
    }

    const parsed = JSON.parse(raw) as Partial<LayoutState>;
    return {
      isSidebarCollapsed: Boolean(parsed.isSidebarCollapsed),
      isInspectorCollapsed: Boolean(parsed.isInspectorCollapsed),
      isTerminalCollapsed: Boolean(parsed.isTerminalCollapsed),
      sidebarSize: sanitizeSize(parsed.sidebarSize, DEFAULT_STATE.sidebarSize),
      inspectorSize: sanitizeSize(parsed.inspectorSize, DEFAULT_STATE.inspectorSize),
      terminalSize: sanitizeSize(parsed.terminalSize, DEFAULT_STATE.terminalSize),
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveLayoutState(state: LayoutState) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
