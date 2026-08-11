type ProfileField = "name" | "sport" | "goal" | "experience";
type PreferenceField = "tone" | "mode" | "language";

export type CanonicalKnowledgeCandidate =
  | {
      destination: "profile";
      field: ProfileField;
      key: string;
      value: string;
      category: string;
    }
  | {
      destination: "preferences";
      field: PreferenceField;
      key: string;
      value: string;
      category: string;
    }
  | {
      destination: "memory";
      key: string;
      value: string;
      category: string;
    };

const canonicalOwners = new Map<
  string,
  | { destination: "profile"; field: ProfileField; key: string }
  | { destination: "preferences"; field: PreferenceField; key: string }
>([
  ["name", { destination: "profile", field: "name", key: "user_name" }],
  ["nome", { destination: "profile", field: "name", key: "user_name" }],
  ["user_name", { destination: "profile", field: "name", key: "user_name" }],
  ["sport", { destination: "profile", field: "sport", key: "user_sport" }],
  ["user_sport", { destination: "profile", field: "sport", key: "user_sport" }],
  ["goal", { destination: "profile", field: "goal", key: "user_goal" }],
  ["primary_goal", { destination: "profile", field: "goal", key: "user_goal" }],
  ["user_goal", { destination: "profile", field: "goal", key: "user_goal" }],
  [
    "experience",
    { destination: "profile", field: "experience", key: "user_experience" },
  ],
  [
    "user_experience",
    { destination: "profile", field: "experience", key: "user_experience" },
  ],
  [
    "preferred_tone",
    { destination: "preferences", field: "tone", key: "preferred_tone" },
  ],
  [
    "tone",
    { destination: "preferences", field: "tone", key: "preferred_tone" },
  ],
  [
    "response_mode",
    { destination: "preferences", field: "mode", key: "response_mode" },
  ],
  ["mode", { destination: "preferences", field: "mode", key: "response_mode" }],
  [
    "language",
    {
      destination: "preferences",
      field: "language",
      key: "preferred_language",
    },
  ],
  [
    "preferred_language",
    {
      destination: "preferences",
      field: "language",
      key: "preferred_language",
    },
  ],
]);

const categoryOnlyKeys = new Set([
  "identity",
  "preference",
  "health",
  "diagnosis",
  "trauma",
  "intimate",
  "schedule",
  "conversation_topic",
  "other",
]);

function normalizeKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

export function canonicalizeKnowledgeCandidate(candidate: {
  key: string;
  value: string;
  category: string;
}): CanonicalKnowledgeCandidate | null {
  const value = candidate.value.trim();
  const key = normalizeKey(candidate.key);
  if (!value || key.length < 3 || key.length > 80) return null;

  const owner = canonicalOwners.get(key);
  if (owner) {
    return {
      ...owner,
      value,
      category: candidate.category,
    };
  }

  if (categoryOnlyKeys.has(key)) return null;

  return {
    destination: "memory",
    key,
    value,
    category: candidate.category,
  };
}
