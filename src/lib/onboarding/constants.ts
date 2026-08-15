export const ONBOARDING_VERSION = 1 as const;
export const ONBOARDING_FIELDS = [
  "name",
  "age",
  "occupation",
  "sportOrSchool",
  "goal",
] as const;

export const ONBOARDING_QUESTIONS = [
  {
    field: "name",
    question: "Come vuoi che ti chiami?",
    skipLabel: "Preferisco non dirlo",
  },
  {
    field: "age",
    question: "Quanti anni hai?",
    skipLabel: "Preferisco non dirlo",
  },
  {
    field: "occupation",
    question: "Di cosa ti occupi? Lavoro o ambito di studio?",
    skipLabel: "Preferisco non dirlo",
  },
  {
    field: "sportOrSchool",
    question:
      "Se pratichi uno sport, quale pratichi e a che livello? Se studi, in che classe o anno sei?",
    skipLabel: "Nessuno dei due",
  },
  {
    field: "goal",
    question: "Su cosa vuoi lavorare o quale obiettivo vuoi raggiungere?",
    skipLabel: "Non ho ancora un obiettivo",
  },
] as const;
