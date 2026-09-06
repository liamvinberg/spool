import type { AuthInteraction, OAuthAuth } from "@earendil-works/pi-ai";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";

/** Only the provider transport is deterministic; pi owns login, refresh and request preparation. */
export function deterministicAuth(models: ModelRuntime, overrides: Partial<OAuthAuth> = {}): void {
	const inference = models.getProvider("openai");
	const streamSimple = models.getRegisteredProviderConfig("openai")?.streamSimple;
	if (!inference || !streamSimple) throw new Error("Missing deterministic inference provider");
	for (const id of ["openai-codex", "xai"]) {
		const provider = models.getProvider(id);
		if (!provider) throw new Error("Missing provider");
		models.registerNativeProvider({
			...provider,
			stream: inference.stream,
			streamSimple,
			auth: {
				...provider.auth,
				oauth: {
					name: "Deterministic subscription",
					login: async (interaction: AuthInteraction) => {
						const method = await interaction.prompt({
							type: "select",
							message: "Choose a sign-in method.",
							options: [
								{ id: "browser", label: "Browser login" },
								{ id: "device", label: "Device code" },
							],
						});
						if (method === "browser") {
							interaction.notify({
								type: "auth_url",
								url: "https://example.invalid/login",
								instructions: "Continue in your browser, then return to spool.",
							});
							await interaction.prompt({
								type: "manual_code",
								message: "Paste the code from your browser.",
								placeholder: "Authorization code",
							});
						} else {
							interaction.notify({
								type: "device_code",
								userCode: "SPOOL-4826",
								verificationUri: "https://example.invalid/device",
							});
							await new Promise<void>((resolve) => setTimeout(resolve, 1500));
						}
						await interaction.prompt({ type: "text", message: "Account name", placeholder: "Your account" });
						await interaction.prompt({ type: "secret", message: "Verification secret" });
						interaction.notify({ type: "progress", message: "finishing sign-in" });
						await new Promise<void>((resolve) => setTimeout(resolve, 1000));
						return {
							type: "oauth",
							refresh: "fixture-refresh-secret",
							access: "fixture-access-secret",
							expires: Date.now() + 3600000,
						};
					},
					refresh: async () => ({
						type: "oauth",
						refresh: "rotated-refresh-secret",
						access: "rotated-access-secret",
						expires: Date.now() + 3600000,
					}),
					toAuth: async (credential) => ({ apiKey: credential.access }),
					...overrides,
				},
			},
		});
	}
}
