export function getCreateChatButtonState({
  isCreating,
  idleLabel,
}: {
  isCreating: boolean;
  idleLabel: string;
}) {
  if (isCreating) {
    return {
      icon: "loading" as const,
      isDisabled: true,
      label: "Creazione...",
    };
  }

  return {
    icon: "idle" as const,
    isDisabled: false,
    label: idleLabel,
  };
}
