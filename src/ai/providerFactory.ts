import type { AISettings } from "../types/domain";
import { DeepSeekProvider } from "./DeepSeekProvider";
import { OpenAIProvider } from "./OpenAIProvider";
import type { LLMProvider } from "./types";

export function createLLMProvider(settings: AISettings, providerName = settings.provider): LLMProvider {
  const normalized = String(providerName).toLowerCase();
  if (normalized === "openai") {
    return new OpenAIProvider(settings);
  }
  if (normalized === "deepseek") {
    return new DeepSeekProvider(settings);
  }

  return new DeepSeekProvider(settings);
}
