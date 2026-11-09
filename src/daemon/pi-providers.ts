/**
 * The providers pi takes a pasted key for (spool#250), apart from the setup that saves
 * one: the first run's page lists them too, and a page must not take the daemon's node
 * code along with them.
 */

/** A provider pi takes a pasted key for, by pi's own id. */
export const PI_KEY_PROVIDERS = [
	{ id: "anthropic", name: "Anthropic" },
	{ id: "openai", name: "OpenAI" },
	{ id: "google", name: "Google Gemini" },
	{ id: "openrouter", name: "OpenRouter" },
	{ id: "deepseek", name: "DeepSeek" },
	{ id: "xai", name: "xAI" },
	{ id: "mistral", name: "Mistral" },
	{ id: "groq", name: "Groq" },
	{ id: "kimi-coding", name: "Kimi" },
	{ id: "minimax", name: "MiniMax" },
	{ id: "zai", name: "Z.ai" },
] as const;
export type PiKeyProvider = (typeof PI_KEY_PROVIDERS)[number]["id"];

export function isPiKeyProvider(value: unknown): value is PiKeyProvider {
	return PI_KEY_PROVIDERS.some((provider) => provider.id === value);
}
