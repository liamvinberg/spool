import { fileURLToPath } from "node:url";
import type { OAuthAuth } from "@earendil-works/pi-ai";
import { buildBundledOAuth } from "./bundled-oauth-build";

let loaded: Promise<OAuthAuth> | undefined;

export function bundledChatGPTOAuth(): Promise<OAuthAuth> {
	loaded ??= (async () => {
		const source = import.meta.url.endsWith(".ts");
		const url = source
			? `data:text/javascript;base64,${Buffer.from(await buildBundledOAuth(fileURLToPath(new URL("./bundled-oauth-page.ts", import.meta.url)))).toString("base64")}`
			: new URL("./bundled-oauth-native.js", import.meta.url).href;
		const module: { openaiCodexOAuth: OAuthAuth } = await import(url);
		return module.openaiCodexOAuth;
	})();
	return loaded;
}
