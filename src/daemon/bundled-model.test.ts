import { randomUUID } from "node:crypto";
import { expect, it, onTestFinished } from "vitest";
import { makeTempDir } from "../test-helpers";
import { deterministicModelRuntime } from "./fixtures/bundled-model-provider";

it("keeps model, connection method, effort and engine identity across account replacement and host restart", async () => {
	const directory = makeTempDir();
	const runtime = await deterministicModelRuntime(directory);
	onTestFinished(() => runtime.close());
	await runtime.request({ kind: "connect", provider: "openai", key: "fixture-openai" });
	await runtime.request({ kind: "connect", provider: "google", key: "fixture-google" });
	await runtime.request({ kind: "connect", provider: "xai", key: "fixture-xai" });
	const options = { root: makeTempDir(), session: { id: randomUUID() }, ask: {} };
	const offers = await runtime.offer(options);
	const duplicates = offers.models.filter((model) => model.displayName === "Test image model");
	expect(duplicates.map((model) => model.value)).toEqual([
		"spool/openai/api_key/spool-test",
		"spool/google/api_key/spool-test",
		"spool/xai/api_key/spool-test",
	]);
	expect(duplicates.map((model) => model.connection)).toEqual(["OpenAI API key", "Google API key", "xAI API key"]);
	const chosen = await runtime.offer({
		...options,
		choose: { value: "spool/xai/api_key/spool-test", effort: "high" },
	});
	expect(chosen.current).toMatchObject({ value: "spool/xai/api_key/spool-test", effort: "high" });
	await runtime.credentials.modify("xai", async () => ({
		type: "oauth",
		access: "fixture",
		refresh: "fixture-refresh",
		expires: Date.now() + 3_600_000,
	}));
	const changed = await runtime.offer(options);
	expect(
		changed.models.some((model) => model.value === "spool/xai/oauth/spool-test" && model.connection === "Grok"),
	).toBe(true);
	expect(changed.current).toEqual(chosen.current);
	expect(changed.models.some((model) => model.value === changed.current.value)).toBe(false);
	const restarted = await deterministicModelRuntime(directory);
	onTestFinished(() => restarted.close());
	expect((await restarted.offer(options)).current).toEqual(chosen.current);
	const quick = await restarted.offer({ ...options, choose: { value: "spool/google/api_key/quick-image" } });
	expect(quick.current.effort).toBeNull();
	expect(quick.models.find((model) => model.value === quick.current.value)?.supportedEffortLevels).toEqual([]);
	for (const value of [
		"spool/openai/api_key/text-only",
		"spool/openai/api_key/unknown",
		"claude/openai/api_key/spool-test",
	]) {
		await expect(restarted.offer({ ...options, choose: { value } })).rejects.toThrow("not available");
	}
	expect((await restarted.offer(options)).current).toEqual(quick.current);
});
