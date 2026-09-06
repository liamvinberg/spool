import type { BundledRuntime } from "../bundled-runtime";
import { deterministicBundledRuntime } from "./bundled-provider";

/** Small deterministic transport catalog; production always uses the pinned provider data. */
export async function deterministicModelRuntime(directory: string): Promise<BundledRuntime> {
	const runtime = await deterministicBundledRuntime(directory);
	const configuration = runtime.models.getRegisteredProviderConfig("openai");
	const image = runtime.models.getModel("openai", "spool-test");
	if (!configuration?.streamSimple || !image) throw new Error("Missing deterministic transport");
	for (const id of ["openai", "google", "xai"] as const) {
		const provider = runtime.models.getProvider(id);
		if (!provider) throw new Error("Missing provider");
		runtime.models.registerNativeProvider({
			...provider,
			getModels: () => [
				{
					...image,
					provider: id,
					thinkingLevelMap: { minimal: null, low: "low", medium: "medium", high: "high", xhigh: null, max: null },
				},
				{ ...image, provider: id, id: "quick-image", name: "Quick image model", reasoning: false },
				{ ...image, provider: id, id: "text-only", name: "Text only model", input: ["text"] },
			],
			streamSimple: configuration.streamSimple,
		});
	}
	// Keep the entire real catalog for the picker simulation; only replies are deterministic.
	for (const id of ["openrouter", "fireworks"]) {
		const provider = runtime.models.getProvider(id);
		if (!provider) throw new Error(`Missing ${id} provider`);
		runtime.models.registerNativeProvider({ ...provider, streamSimple: configuration.streamSimple });
	}
	return runtime;
}
