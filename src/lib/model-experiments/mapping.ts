export function randomizeVariantSlots<T extends { id: string }>(
  control: T,
  candidate: T,
  random: () => number = Math.random,
) {
  return random() < 0.5
    ? { slotA: control, slotB: candidate }
    : { slotA: candidate, slotB: control };
}

export function selectVariantIdForChoice({
  choice,
  slotAVariantId,
  slotBVariantId,
  controlVariantId,
  successfulVariantId,
}: {
  choice: "A" | "B" | "TIE" | "AUTO_CONTROL" | "AUTO_SUCCESS";
  slotAVariantId: string;
  slotBVariantId: string;
  controlVariantId: string;
  successfulVariantId?: string;
}) {
  if (choice === "TIE" || choice === "AUTO_CONTROL") return controlVariantId;
  if (choice === "A") return slotAVariantId;
  if (choice === "B") return slotBVariantId;
  if (!successfulVariantId) throw new Error("SELECTED_RESPONSE_UNAVAILABLE");
  return successfulVariantId;
}
