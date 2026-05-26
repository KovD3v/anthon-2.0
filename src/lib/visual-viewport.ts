interface VisualViewportLike {
  addEventListener?: (type: "resize" | "scroll", listener: () => void) => void;
  height: number;
  removeEventListener?: (
    type: "resize" | "scroll",
    listener: () => void,
  ) => void;
}

interface WindowLike {
  addEventListener?: (type: "resize", listener: () => void) => void;
  innerHeight: number;
  removeEventListener?: (type: "resize", listener: () => void) => void;
  visualViewport?: VisualViewportLike | null;
}

interface StyleTarget {
  style: {
    removeProperty: (propertyName: string) => void;
    setProperty: (propertyName: string, value: string) => void;
  };
}

export function getChatViewportSizing(win: WindowLike) {
  const visualViewport = win.visualViewport;
  const height = Math.round(visualViewport?.height ?? win.innerHeight);

  return {
    height: `${height}px`,
  };
}

export function installChatViewportSizing(
  target: StyleTarget,
  win: WindowLike = window,
) {
  const sync = () => {
    const sizing = getChatViewportSizing(win);
    target.style.setProperty("--chat-viewport-height", sizing.height);
  };

  sync();

  win.visualViewport?.addEventListener?.("resize", sync);
  win.visualViewport?.addEventListener?.("scroll", sync);
  win.addEventListener?.("resize", sync);

  return () => {
    win.visualViewport?.removeEventListener?.("resize", sync);
    win.visualViewport?.removeEventListener?.("scroll", sync);
    win.removeEventListener?.("resize", sync);
    target.style.removeProperty("--chat-viewport-height");
  };
}
