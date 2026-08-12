import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ease, fadeUp, scaleIn } from "./motion";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("motion contracts", () => {
  it("uses strong shared curves and compositor transform variants", () => {
    expect(ease.out).toEqual([0.23, 1, 0.32, 1]);
    expect(ease.inOut).toEqual([0.77, 0, 0.175, 1]);
    expect(ease.drawer).toEqual([0.32, 0.72, 0, 1]);
    expect(fadeUp.hidden).toEqual({
      opacity: 0,
      transform: "translateY(12px)",
    });
    expect(scaleIn.hidden).toEqual({
      opacity: 0,
      transform: "scale(0.95)",
    });
  });

  it("opts chat routes out of page entrance motion", () => {
    for (const path of [
      "src/app/(chat)/chat/page.tsx",
      "src/app/(chat)/chat/[id]/page.tsx",
      "src/app/(chat)/chat/[id]/loading.tsx",
      "src/app/(chat)/chat/routines/page.tsx",
    ]) {
      expect(source(path)).toContain("motion={false}");
    }
  });

  it("keeps progress motion on compositor transforms with correct timing", () => {
    const routine = source("src/app/(chat)/components/RoutineRunner.tsx");
    const audio = source("src/app/(chat)/components/AudioPlayer.tsx");
    const progress = source("src/components/ui/progress.tsx");

    expect(routine).not.toContain("transition-[width]");
    expect(routine).toContain("scaleX($" + "{progress.routinePercent / 100})");
    expect(routine).toContain("scaleX($" + "{progress.stepPercent / 100})");
    expect(audio).toContain("transition-transform duration-100 ease-linear");
    expect(progress).toContain("scaleX($" + "{normalizedValue / 100})");
  });

  it("does not use broad transitions in live application source", () => {
    for (const path of [
      "src/app/(chat)/components/SuggestedActions.tsx",
      "src/app/(chat)/components/AudioRecorder.tsx",
      "src/app/(chat)/chat/page.tsx",
      "src/app/(marketing)/profile/components/UsageSection.tsx",
      "src/components/ui/progress.tsx",
      "src/components/ui/tabs.tsx",
    ]) {
      expect(source(path), path).not.toContain("transition-all");
    }
  });

  it("uses transitions instead of restartable popup keyframes", () => {
    for (const path of [
      "src/components/ui/dialog.tsx",
      "src/components/ui/dropdown-menu.tsx",
      "src/components/ui/select.tsx",
      "src/components/ui/popover.tsx",
      "src/components/ui/tooltip.tsx",
    ]) {
      expect(source(path), path).not.toContain("animate-in");
      expect(source(path), path).not.toContain("animate-out");
      expect(source(path), path).toContain("motion-reduce:transform-none");
    }
  });

  it("coordinates high-value chat state changes", () => {
    const layout = source("src/app/(chat)/chat/layout-client.tsx");
    const conversation = source(
      "src/app/(chat)/chat/[id]/chat-conversation-client.tsx",
    );
    const routine = source("src/app/(chat)/components/RoutineRunner.tsx");
    const search = source("src/app/(chat)/components/SearchDialog.tsx");
    const checkIn = source("src/app/(chat)/components/RoutineCheckInForm.tsx");
    const history = source("src/app/(chat)/components/RoutineHistory.tsx");

    expect(layout).toContain("transition-[grid-template-columns]");
    expect(layout).toContain("data-desktop-sidebar-open");
    expect(conversation).toContain('key="empty-chat"');
    expect(conversation).toContain('key="message-list"');
    expect(routine).toContain("key={runnerContentKey}");
    expect(search).toContain("key={searchState}");
    expect(checkIn).toContain('key="routine-note"');
    expect(history).toContain('key="routine-history"');
  });
});
