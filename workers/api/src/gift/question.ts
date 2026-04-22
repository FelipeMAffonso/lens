// CJ-W48 — per-category criterion templates the recipient fills in.
// Keyed by category slug used elsewhere in the repo. The values are the
// prompts the recipient sees; keys become the criteria keys in the response.

export interface CriterionPrompt {
  key: string;
  label: string;
  scale: "0-1";
}

const GENERIC_TEMPLATE: CriterionPrompt[] = [
  { key: "quality",  label: "How much do you care about quality?",  scale: "0-1" },
  { key: "simplicity", label: "How much do you care about simplicity?", scale: "0-1" },
  { key: "longevity", label: "How much do you care about longevity?", scale: "0-1" },
  { key: "aesthetics", label: "How much do you care about how it looks?", scale: "0-1" },
];

const TEMPLATES: Record<string, CriterionPrompt[]> = {
  "espresso-machines": [
    { key: "pressure",      label: "Brewing strength",     scale: "0-1" },
    { key: "build_quality", label: "Build quality",         scale: "0-1" },
    { key: "noise",         label: "Quietness",             scale: "0-1" },
    { key: "ease_of_use",   label: "Simplicity of use",     scale: "0-1" },
  ],
  laptops: [
    { key: "performance",   label: "Raw speed",             scale: "0-1" },
    { key: "portability",   label: "Thin + light",          scale: "0-1" },
    { key: "battery",       label: "Battery life",          scale: "0-1" },
    { key: "display",       label: "Display quality",       scale: "0-1" },
  ],
  headphones: [
    { key: "anc",           label: "Noise cancellation",    scale: "0-1" },
    { key: "comfort",       label: "Comfort on long wear",  scale: "0-1" },
    { key: "sound",         label: "Sound quality",         scale: "0-1" },
    { key: "battery",       label: "Battery life",          scale: "0-1" },
  ],
  "coffee-makers": [
    { key: "speed",         label: "How quickly it brews",  scale: "0-1" },
    { key: "build_quality", label: "Build quality",         scale: "0-1" },
    { key: "ease_of_use",   label: "Simplicity",            scale: "0-1" },
    { key: "programmable",  label: "Programmability",       scale: "0-1" },
  ],
  "robot-vacuums": [
    { key: "suction",       label: "Suction power",         scale: "0-1" },
    { key: "mapping",       label: "Navigation quality",    scale: "0-1" },
    { key: "noise",         label: "Quietness",             scale: "0-1" },
    { key: "autonomy",      label: "Self-empty / autonomy", scale: "0-1" },
  ],
};

export function questionTemplateFor(category: string | null | undefined): CriterionPrompt[] {
  if (!category) return GENERIC_TEMPLATE;
  return TEMPLATES[category] ?? GENERIC_TEMPLATE;
}

export function knownCategories(): string[] {
  return Object.keys(TEMPLATES);
}
