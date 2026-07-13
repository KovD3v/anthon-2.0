import type { UIMessage } from "ai";

export type ModelComparisonSlot = "A" | "B";
export type ModelComparisonChoice = ModelComparisonSlot | "TIE";
export type ModelComparisonSlotStatus =
  | "pending"
  | "streaming"
  | "completed"
  | "failed";

export interface ModelComparisonData {
  pairId: string;
  noticeRequired: boolean;
  status: "generating" | "ready" | "resolved" | "partial_failed";
  slots: Record<
    ModelComparisonSlot,
    { status: ModelComparisonSlotStatus; text: string }
  >;
}

export interface ModelComparisonDeltaData {
  pairId: string;
  slot: ModelComparisonSlot;
  delta: string;
}

export type AnthonUIMessage = UIMessage<
  unknown,
  {
    modelComparison: ModelComparisonData;
    modelComparisonDelta: ModelComparisonDeltaData;
  }
>;

export interface ModelExperimentSummary {
  id: string;
  key: string;
  name: string;
  status: "DRAFT" | "READY" | "ACTIVE" | "PAUSED" | "COMPLETED";
  sampleSize: number;
  participants: number;
  daysRunning: number;
  votes: { control: number; candidate: number; tie: number };
  decisiveCandidateShare: number | null;
  decisiveCandidateShare95: [number, number] | null;
  partialFailureRate: number;
  failureRate: number;
  latency: {
    control: {
      firstTokenP50: number | null;
      firstTokenP95: number | null;
      totalP50: number | null;
      totalP95: number | null;
    };
    candidate: {
      firstTokenP50: number | null;
      firstTokenP95: number | null;
      totalP50: number | null;
      totalP95: number | null;
    };
  };
  cost: { control: number; candidate: number; overhead: number };
  outputTokensPerSecond: { control: number | null; candidate: number | null };
  canonicalFeedback: { positive: number; neutral: number; negative: number };
  readyForManualReview: boolean;
}
