interface VisualViewportLike {
  addEventListener?: (type: "resize" | "scroll", listener: () => void) => void;
  height: number;
  offsetTop?: number;
  pageTop?: number;
  removeEventListener?: (
    type: "resize" | "scroll",
    listener: () => void,
  ) => void;
}

interface WindowLike {
  addEventListener?: (type: "resize", listener: () => void) => void;
  innerHeight: number;
  scrollY?: number;
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
  const pageOffset =
    visualViewport?.pageTop === undefined
      ? 0
      : visualViewport.pageTop - (win.scrollY ?? 0);
  const offsetTop = Math.round(
    Math.max(0, visualViewport?.offsetTop ?? 0, pageOffset),
  );

  return {
    height: `${height}px`,
    offsetTop: `${offsetTop}px`,
  };
}

export function installChatViewportSizing(
  target: StyleTarget,
  win: WindowLike = window,
) {
  const sync = () => {
    const sizing = getChatViewportSizing(win);
    target.style.setProperty("--chat-viewport-height", sizing.height);
    target.style.setProperty("--chat-viewport-offset-top", sizing.offsetTop);
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
    target.style.removeProperty("--chat-viewport-offset-top");
  };
}
