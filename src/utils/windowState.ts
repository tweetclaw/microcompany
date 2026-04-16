import { LogicalPosition, LogicalSize } from '@tauri-apps/api/dpi';
import { getCurrentWindow } from '@tauri-apps/api/window';

interface WindowState {
  width: number;
  height: number;
  x: number;
  y: number;
  maximized: boolean;
}

const STORAGE_KEY = 'microcompany-window-state';

export async function restoreWindowState() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }

    const state = JSON.parse(raw) as Partial<WindowState>;
    const appWindow = getCurrentWindow();

    if (state.width && state.height) {
      await appWindow.setSize(new LogicalSize(state.width, state.height));
    }

    if (typeof state.x === 'number' && typeof state.y === 'number') {
      await appWindow.setPosition(new LogicalPosition(state.x, state.y));
    }

    if (state.maximized) {
      await appWindow.maximize();
    }
  } catch (error) {
    console.warn('Failed to restore window state:', error);
  }
}

export async function bindWindowStatePersistence() {
  const appWindow = getCurrentWindow();

  const persist = async () => {
    try {
      const [size, position, maximized] = await Promise.all([
        appWindow.innerSize(),
        appWindow.outerPosition(),
        appWindow.isMaximized(),
      ]);

      if (maximized) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
          width: size.width,
          height: size.height,
          x: position.x,
          y: position.y,
          maximized: true,
        }));
        return;
      }

      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        width: size.width,
        height: size.height,
        x: position.x,
        y: position.y,
        maximized: false,
      }));
    } catch (error) {
      console.warn('Failed to persist window state:', error);
    }
  };

  const unlistenResize = await appWindow.onResized(() => {
    void persist();
  });

  const unlistenMove = await appWindow.onMoved(() => {
    void persist();
  });

  return () => {
    unlistenResize();
    unlistenMove();
  };
}
