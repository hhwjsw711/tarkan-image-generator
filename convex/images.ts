"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import Replicate from "replicate";
import { Id } from "./_generated/dataModel";

const REPLICATE_MODELS: Record<string, string> = {
  "imagen-4": "google/imagen-4",
  "nano-banana-pro": "google/nano-banana-pro",
  "nano-banana-2": "google/nano-banana-2",
  "nano-banana-og": "google/nano-banana",
};

const ENHANCE_MODEL = "google/gemini-2.5-flash";

function hasReplicateConfig(): boolean {
  return !!process.env.REPLICATE_API_TOKEN;
}

function createReplicateClient(): Replicate {
  const apiToken = process.env.REPLICATE_API_TOKEN;
  if (!apiToken) {
    throw new Error(
      "Set REPLICATE_API_TOKEN. Add it in the Convex dashboard under Settings > Environment Variables."
    );
  }
  return new Replicate({ auth: apiToken });
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const isRateLimit =
        msg.includes("429") ||
        msg.includes("rate_limit") ||
        msg.includes("Too many requests");
      if (!isRateLimit || attempt === maxRetries) throw e;
      const delay = Math.pow(2, attempt) * 5000;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("Unreachable");
}

async function enhancePrompt(
  replicate: Replicate,
  prompt: string
): Promise<string> {
  const wordCount = prompt.trim().split(/\s+/).length;
  if (wordCount >= 120) {
    return prompt;
  }

  const systemPrompt = `You are a world-class image generation prompt engineer with deep expertise in photography, cinematography, fine art, and visual storytelling. Your task is to transform simple prompts into richly detailed, production-ready image generation prompts.

RULES — follow every one:

1. PRESERVE INTENT: Keep ALL original subjects, objects, actions, and the core concept intact. Never remove, replace, or contradict anything the user described. The user's vision is sacred.

2. TARGET LENGTH: Expand the prompt to 80-150 words. Short prompts need the most expansion; longer ones need less. Never exceed 200 words.

3. ADD LAYERS OF DETAIL — enrich the prompt across these dimensions where relevant:
   - LIGHTING: Specify direction (rim, side, back, overhead), quality (hard, diffused, volumetric), color temperature (warm tungsten, cool daylight, mixed), and atmospheric effects (god rays, caustics, light shafts, ambient glow).
   - MATERIALS & TEXTURES: Describe surface qualities — roughness, reflectivity, translucency, patina, weave, grain, weathering. Be specific: "brushed matte aluminum with micro-scratches" not just "metal".
   - COMPOSITION & CAMERA: Suggest framing (close-up, medium shot, wide establishing), camera angle (low angle heroic, eye-level intimate, bird's eye), depth of field, leading lines, rule of thirds placement.
   - ATMOSPHERE & MOOD: Convey emotional tone through environmental cues — haze, dust motes, steam, rain droplets, time of day, season, weather conditions.
   - COLOR PALETTE: Define dominant and accent colors, contrast relationships, saturation levels, color harmony (complementary, analogous, triadic).
   - FINE DETAILS: Add small narrative-enhancing elements — subtle environmental storytelling, secondary objects, background elements that add depth without stealing focus.
   - TECHNICAL QUALITY: Reference camera bodies, lens characteristics, film stocks, rendering engines, or artistic techniques that establish the visual standard.

4. LOGICAL CONSISTENCY: Only add details that are physically and contextually plausible. Indoor scenes don't have horizons. Underwater scenes don't have dust. Night scenes don't have harsh sunlight. Think before you add.

5. CONCRETE LANGUAGE: Replace every vague adjective with a specific, evocative descriptor. "Beautiful sunset" → "molten amber and deep crimson sunset bleeding into indigo twilight with cirrus clouds catching the last magenta light". "Nice texture" → "hand-worn oak grain with deep honey-toned patina and hairline age cracks".

6. OUTPUT FORMAT: Return ONLY the enhanced prompt text. No quotes, no labels, no explanations, no preamble, no "Enhanced prompt:" prefix. Just the prompt itself.`;

  try {
    const output: unknown = await withRetry(
      () =>
        replicate.run(ENHANCE_MODEL as `${string}/${string}`, {
          input: {
            prompt: `${systemPrompt}\n\nUser prompt: ${prompt}`,
            max_output_tokens: 2000,
            temperature: 0.7,
          },
        }),
      1
    );

    let enhanced = "";
    if (typeof output === "string") {
      enhanced = output.trim();
    } else if (Array.isArray(output)) {
      enhanced = (output as string[]).join("").trim();
    }

    if (!enhanced || enhanced.length < prompt.length * 0.5) {
      return prompt;
    }

    return enhanced;
  } catch (e) {
    console.error("Prompt enhancement failed:", e);
    return prompt;
  }
}

function extractImageUrl(output: unknown): string | null {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    if (output.length > 0 && typeof output[0] === "string") return output[0];
    return null;
  }
  if (output && typeof output === "object") {
    const obj = output as Record<string, unknown>;
    if (typeof obj.url === "string") return obj.url;
    if (typeof obj.url === "function") return obj.url();
  }
  return null;
}

export const generate = action({
  args: {
    prompt: v.string(),
    originalPrompt: v.optional(v.string()),
    stylePreset: v.optional(v.string()),
    styleSuffix: v.optional(v.string()),
    aspectRatio: v.string(),
    numberOfImages: v.number(),
    referenceImageStorageIds: v.optional(v.array(v.id("_storage"))),
    keepReferenceIds: v.optional(v.array(v.id("_storage"))),
    enhancePrompt: v.optional(v.boolean()),
    model: v.optional(v.string()),
  },
  returns: v.id("generations"),
  handler: async (ctx, args): Promise<Id<"generations">> => {
    const replicate = createReplicateClient();
    const selectedModel = args.model || "imagen-4";
    const isImagen = selectedModel === "imagen-4";

    let enhancedPrompt = args.prompt;
    if (args.enhancePrompt) {
      const imgTagPattern = /@img\d+/g;
      const imgTags: { index: number; tag: string }[] = [];
      let match;
      while ((match = imgTagPattern.exec(args.prompt)) !== null) {
        imgTags.push({ index: match.index, tag: match[0] });
      }
      const strippedPrompt = args.prompt.replace(
        imgTagPattern,
        "<<IMG_PLACEHOLDER>>"
      );
      const enhanced = await enhancePrompt(replicate, strippedPrompt);
      let tagIdx = 0;
      enhancedPrompt = enhanced.replace(/<<IMG_PLACEHOLDER>>/g, () => {
        return imgTags[tagIdx] ? imgTags[tagIdx++].tag : "";
      });
      for (let i = tagIdx; i < imgTags.length; i++) {
        enhancedPrompt += ` ${imgTags[i].tag}`;
      }
    }

    let finalPrompt = enhancedPrompt;
    if (args.styleSuffix) {
      finalPrompt = `${enhancedPrompt}, ${args.styleSuffix}`;
    }

    const refImageUrls: string[] = [];
    const refStorageIds: Id<"_storage">[] = [];
    if (args.referenceImageStorageIds?.length) {
      for (let i = 0; i < args.referenceImageStorageIds.length; i++) {
        const storageId = args.referenceImageStorageIds[i];
        const refBlob = await ctx.storage.get(storageId);
        if (!refBlob)
          throw new Error(
            `Reference image @img${i + 1} not found in storage.`
          );
        const url = await ctx.storage.getUrl(storageId);
        if (!url)
          throw new Error(
            `Reference image @img${i + 1} URL not available.`
          );
        refImageUrls.push(url);
        refStorageIds.push(storageId);
      }
    }

    const actualModel =
      isImagen && refImageUrls.length === 0
        ? "imagen-4"
        : isImagen
          ? "nano-banana-pro"
          : selectedModel;

    const modelId =
      REPLICATE_MODELS[actualModel] || REPLICATE_MODELS["imagen-4"];

    const cleanPrompt = finalPrompt
      .replace(/@img\d+/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const generationId = await ctx.runMutation(internal.generations.create, {
      prompt: cleanPrompt,
      originalPrompt: args.prompt,
      stylePreset: args.stylePreset,
      styleSuffix: args.styleSuffix,
      wasEnhanced: args.enhancePrompt || false,
      enhancedPrompt: args.enhancePrompt ? enhancedPrompt : undefined,
      aspectRatio: args.aspectRatio,
      numberOfImages: args.numberOfImages,
      imageStorageIds: [],
      model: actualModel,
      provider: "replicate",
      referenceImageStorageIds: args.keepReferenceIds,
    });

    try {
      const aspectRatio =
        args.aspectRatio === "auto" ? undefined : args.aspectRatio;

      for (let i = 0; i < args.numberOfImages; i++) {
        const input: Record<string, unknown> = {
          prompt: cleanPrompt,
        };

        if (actualModel === "imagen-4") {
          if (aspectRatio) input.aspect_ratio = aspectRatio;
          input.safety_filter_level = "block_medium_and_above";
        } else if (actualModel === "nano-banana-pro") {
          if (aspectRatio) input.aspect_ratio = aspectRatio;
          input.output_format = "png";
          input.safety_filter_level = "block_only_high";
          if (refImageUrls.length > 0) input.image_input = refImageUrls;
        } else if (actualModel === "nano-banana-2") {
          if (aspectRatio) input.aspect_ratio = aspectRatio;
        } else if (actualModel === "nano-banana-og") {
          input.output_format = "png";
          if (refImageUrls.length > 0) input.image_input = refImageUrls;
        }

        const output: unknown = await withRetry(() =>
          replicate.run(modelId as `${string}/${string}`, { input })
        );

        const imageUrl = extractImageUrl(output);

        if (!imageUrl) {
          console.error(`Replicate returned no image URL for ${modelId}`, JSON.stringify(output));
          continue;
        }

        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
          console.error(
            `Failed to fetch image from Replicate: ${imageResponse.status} ${imageResponse.statusText}`
          );
          continue;
        }

        const contentType =
          imageResponse.headers.get("content-type") || "image/png";
        const arrayBuffer = await imageResponse.arrayBuffer();
        const blob = new Blob([arrayBuffer], { type: contentType });
        const storageId = await ctx.storage.store(blob);
        await ctx.runMutation(internal.generations.addImage, {
          generationId,
          storageId,
        });
      }

      const finalGen = await ctx.runQuery(internal.generations.get, {
        generationId,
      });
      if (!finalGen || finalGen.imageStorageIds.length === 0) {
        await ctx.runMutation(internal.generations.markFailed, {
          generationId,
          error:
            "No images were returned. The model may have filtered the content or failed silently. Try rephrasing your prompt.",
        });
      } else {
        await ctx.runMutation(internal.generations.markComplete, {
          generationId,
        });
      }
    } catch (e: unknown) {
      const raw = e instanceof Error ? e.message : String(e);
      let errorMsg: string;

      if (raw.includes("429") || raw.includes("rate_limit")) {
        errorMsg =
          "Replicate rate limit hit — too many requests. Try fewer images or wait a moment.";
      } else if (raw.includes("401") || raw.includes("Unauthorized")) {
        errorMsg =
          "Replicate API token is invalid. Check your REPLICATE_API_TOKEN env var.";
      } else if (
        raw.includes("NSFW") ||
        raw.includes("safety") ||
        raw.includes("filtered")
      ) {
        errorMsg =
          "The model couldn't complete this request — likely content filtering. Try rephrasing your prompt.";
      } else {
        errorMsg = raw.slice(0, 500);
      }

      await ctx.runMutation(internal.generations.markFailed, {
        generationId,
        error: errorMsg,
      });
    } finally {
      if (args.referenceImageStorageIds) {
        const keepSet = new Set(
          (args.keepReferenceIds ?? []).map((id) => id.toString())
        );
        for (const sid of args.referenceImageStorageIds) {
          if (!keepSet.has(sid.toString())) {
            await ctx.storage.delete(sid);
          }
        }
      }
    }

    return generationId;
  },
});

export const getAvailableProviders = action({
  args: {},
  returns: v.object({
    replicate: v.boolean(),
  }),
  handler: async (): Promise<{ replicate: boolean }> => ({
    replicate: hasReplicateConfig(),
  }),
});
