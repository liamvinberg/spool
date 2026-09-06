export const BUNDLED_CONNECTIONS = [
	{ provider: "openai-codex", method: "oauth", name: "ChatGPT", label: "Sign in with ChatGPT" },
	{ provider: "xai", method: "oauth", name: "Grok", label: "Sign in with Grok" },
	...(["OpenAI", "Anthropic", "Google", "xAI", "OpenRouter"] as const).map((name) => ({
		provider: name.toLowerCase(),
		method: "api_key" as const,
		name,
		label: `${name} API key`,
	})),
	{ provider: "fireworks", method: "api_key", name: "Fireworks AI", label: "Fireworks AI API key" },
] as const;

export function connectionLabel(provider: string, method: string): string {
	const connection = BUNDLED_CONNECTIONS.find((item) => item.provider === provider && item.method === method);
	return connection?.method === "oauth" ? connection.name : (connection?.label ?? "Account");
}
