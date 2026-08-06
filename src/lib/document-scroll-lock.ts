interface ScrollLockTarget {
  classList: Pick<DOMTokenList, "add" | "remove">;
}

export function installDocumentScrollLock(
  target: ScrollLockTarget,
  shouldLock: boolean,
) {
  if (shouldLock) {
    target.classList.add("no-scroll");
  } else {
    target.classList.remove("no-scroll");
  }

  return () => {
    target.classList.remove("no-scroll");
  };
}
