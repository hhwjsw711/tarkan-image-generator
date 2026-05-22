// Replicate pricing per model (last verified 2026-05-22)
// https://replicate.com/google
// nano-banana-pro and nano-banana-2 have resolution-based tiers;
// we use 1K pricing as the default since we don't pass resolution.

export const MODEL_PRICING: Record<
  string,
  { inputPerMillion: number; outputPerImage: number }
> = {
  "imagen-4": {
    inputPerMillion: 0,
    outputPerImage: 0.04,
  },
  "nano-banana-pro": {
    inputPerMillion: 0,
    outputPerImage: 0.15,
  },
  "nano-banana-2": {
    inputPerMillion: 0,
    outputPerImage: 0.067,
  },
  "nano-banana-og": {
    inputPerMillion: 0,
    outputPerImage: 0.039,
  },
};

const DEFAULT_PRICING = MODEL_PRICING["nano-banana-2"];

export function calculateGenerationCost(
  model: string | undefined,
  promptTokens: number | undefined | null,
  imageCount: number
): number {
  const pricing = (model && MODEL_PRICING[model]) || DEFAULT_PRICING;
  const inputCost = promptTokens
    ? (promptTokens / 1_000_000) * pricing.inputPerMillion
    : 0;
  const outputCost = imageCount * pricing.outputPerImage;
  return inputCost + outputCost;
}
