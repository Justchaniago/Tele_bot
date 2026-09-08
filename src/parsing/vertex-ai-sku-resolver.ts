import { GoogleGenAI, type GenerateContentResponse } from "@google/genai";
import type { AiSkuResponse, AiSkuResolver } from "./ai-fallback.js";
import { validateAiSkuResponse } from "./ai-fallback.js";
import type { CanonicalSkuId, DomainId } from "../core/identifiers.js";

export type VertexAiSkuResolverConfig = {
  readonly projectId: string;
  readonly location: string;
  readonly model: string;
  readonly timeoutMs: number;
};

  type VertexModelClient = { readonly models: { readonly generateContent: (input: { readonly model: string; readonly contents: string; readonly config: { readonly temperature: number; readonly candidateCount: number; readonly maxOutputTokens: number; readonly responseMimeType: string; readonly responseJsonSchema: unknown; readonly abortSignal: AbortSignal } }) => Promise<GenerateContentResponse> } };

const responseSchema = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["RESOLVED", "AMBIGUOUS", "UNKNOWN"] },
    candidateSkuId: { type: "string" }
  },
  required: ["status"],
  additionalProperties: false
} as const;

export class VertexAiSkuResolver implements AiSkuResolver {
  private readonly client: VertexModelClient;
  constructor(private readonly config: VertexAiSkuResolverConfig, client?: VertexModelClient) {
    this.client = client ?? new GoogleGenAI({ vertexai: true, project: config.projectId, location: config.location });
    if (!Number.isFinite(config.timeoutMs) || config.timeoutMs <= 0) throw new Error("Vertex AI timeout must be positive");
  }

  async resolve(input: { readonly domain: DomainId; readonly normalizedTerm: string; readonly candidates: readonly CanonicalSkuId[]; readonly candidateContext?: readonly { readonly canonicalSkuId: CanonicalSkuId; readonly canonicalName: string; readonly aliases: readonly string[] }[] }): Promise<AiSkuResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.client.models.generateContent({
        model: this.config.model,
        contents: [
          "Resolve one residual SKU term. Do not infer missing qualifiers. Return JSON only.",
          `domain=${input.domain}`,
          `term=${input.normalizedTerm}`,
          `candidates=${JSON.stringify(input.candidateContext ?? input.candidates)}`,
          "Return RESOLVED only when exactly one candidate is clearly supported; otherwise AMBIGUOUS or UNKNOWN."
        ].join("\n"),
        config: { temperature: 0, candidateCount: 1, maxOutputTokens: 64, responseMimeType: "application/json", responseJsonSchema: responseSchema, abortSignal: controller.signal }
      });
      return toAiResponse(response, input.candidates);
    } catch {
      return { status: "UNKNOWN" };
    } finally {
      clearTimeout(timer);
    }
  }
}

function toAiResponse(response: GenerateContentResponse, candidates: readonly CanonicalSkuId[]): AiSkuResponse {
  const text = response.text;
  if (!text) return { status: "UNKNOWN" };
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return { status: "UNKNOWN" }; }
  const validated = validateAiSkuResponse(parsed, candidates);
  if (validated.status === "RESOLVED") return { status: "RESOLVED", candidateSkuId: validated.canonicalSkuId };
  if (validated.status === "AMBIGUOUS") return { status: "AMBIGUOUS" };
  return { status: "UNKNOWN" };
}
