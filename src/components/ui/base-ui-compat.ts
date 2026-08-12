import {
  createContext,
  type MutableRefObject,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";

export interface AutoFocusEvent {
  defaultPrevented: boolean;
  preventDefault: () => void;
}

interface BaseUIRootFocusContextValue {
  closeHandlerRef: MutableRefObject<
    ((event: AutoFocusEvent) => void) | undefined
  >;
}

export const BaseUIRootFocusContext =
  createContext<BaseUIRootFocusContextValue | null>(null);

export function useBaseUIRootFocus(open: boolean) {
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const closeHandlerRef = useRef<((event: AutoFocusEvent) => void) | undefined>(
    undefined,
  );
  const openRef = useRef(open);
  openRef.current = open;

  const restoreFocus = useCallback(() => {
    const handler = closeHandlerRef.current;
    if (handler) {
      const focusTarget = runAutoFocusHandler(handler);
      if (focusTarget instanceof HTMLElement) {
        focusTarget.focus();
      }
      return;
    }
    if (returnFocusRef.current?.isConnected) {
      returnFocusRef.current.focus();
    }
  }, []);

  const previousOpenRef = useRef(open);
  useEffect(() => {
    if (previousOpenRef.current && !open) {
      queueMicrotask(restoreFocus);
    }
    previousOpenRef.current = open;
  }, [open, restoreFocus]);

  useEffect(
    () => () => {
      if (openRef.current) {
        queueMicrotask(restoreFocus);
      }
    },
    [restoreFocus],
  );

  const contextValue = useMemo(() => ({ closeHandlerRef }), []);
  const captureReturnFocus = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      returnFocusRef.current = document.activeElement;
    }
  }, []);

  return { captureReturnFocus, contextValue };
}

export function runAutoFocusHandler(handler: (event: AutoFocusEvent) => void) {
  const activeBefore = document.activeElement;
  const event: AutoFocusEvent = {
    defaultPrevented: false,
    preventDefault() {
      event.defaultPrevented = true;
    },
  };

  handler(event);

  if (!event.defaultPrevented) {
    return true;
  }

  const activeAfter = document.activeElement;
  return activeAfter instanceof HTMLElement && activeAfter !== activeBefore
    ? activeAfter
    : false;
}

export function trapTabKey(event: ReactKeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") {
    return;
  }

  const focusable = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter(
    (element) =>
      !element.hidden &&
      element.getAttribute("aria-hidden") !== "true" &&
      !element.closest("[inert]"),
  );

  if (focusable.length === 0) {
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  }
}
