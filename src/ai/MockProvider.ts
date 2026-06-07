import type { ChatResult, LLMProvider, Message } from "./types";

export class MockProvider implements LLMProvider {
  async chatText(messages: Message[]): Promise<ChatResult> {
    return withUsage(messages, "Mock connection success", 6);
  }

  async chatJson(messages: Message[]): Promise<ChatResult> {
    return withUsage(
      messages,
      JSON.stringify({
        main_events: ["Mock main event"],
        main_plot_progress: "Mock plot progress.",
        branch_candidates: [],
        important_characters: ["Lina"],
        faction_change_candidates: [],
        key_event_markers: []
      }),
      80
    );
  }
}

function withUsage(messages: Message[], content: string, completionTokens: number): ChatResult {
  const promptTokens = Math.ceil(messages.map((message) => message.content).join("\n").length / 4);
  return {
    content,
    usage: {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens
    }
  };
}
