import { describe, expect, it } from "vitest";
import { publicationResponseSchema, publicationResponseSchemaForOrigin } from "./publication-response";

const publication = {
	id: "opaque-publication-id",
	projectId: "project",
	ownerId: "owner",
	title: "Shared site",
	hostname: `p${"a".repeat(32)}-beta.onspool.page`,
	url: `https://p${"a".repeat(32)}-beta.onspool.page`,
	entry: "start",
	scenario: "default",
	state: "active" as const,
	revision: 1,
	accessGeneration: 1,
	currentVersion: { id: "version", contentIdentity: "content" },
	invitedEmails: ["viewer@example.com"],
	createdAt: 1,
	updatedAt: 1,
};

describe("publication response host", () => {
	it("accepts the isolated and production publication contracts while keeping IDs opaque", () => {
		expect(publicationResponseSchema.parse(publication).id).toBe("opaque-publication-id");
		expect(
			publicationResponseSchema.parse({
				...publication,
				hostname: `p${"b".repeat(32)}.onspool.page`,
				url: `https://p${"b".repeat(32)}.onspool.page/`,
			}).hostname,
		).toBe(`p${"b".repeat(32)}.onspool.page`);
	});

	it("rejects retired, mismatched and non-origin URLs", () => {
		for (const changed of [
			{
				hostname: `p${"a".repeat(32)}.beta.onspool.page`,
				url: `https://p${"a".repeat(32)}.beta.onspool.page`,
			},
			{
				hostname: `p${"a".repeat(32)}.extra-beta.onspool.page`,
				url: `https://p${"a".repeat(32)}.extra-beta.onspool.page`,
			},
			{
				hostname: `P${"A".repeat(32)}-beta.onspool.page`,
				url: `https://P${"A".repeat(32)}-beta.onspool.page`,
			},
			{ url: `https://p${"b".repeat(32)}-beta.onspool.page` },
			{ url: `${publication.url}/frame` },
		])
			expect(publicationResponseSchema.safeParse({ ...publication, ...changed }).success).toBe(false);
	});

	it("rejects a publication host from the opposite cloud environment", () => {
		expect(publicationResponseSchemaForOrigin("https://beta.spool.page").safeParse(publication).success).toBe(true);
		expect(publicationResponseSchemaForOrigin("https://spool.page").safeParse(publication).success).toBe(false);
		const production = {
			...publication,
			hostname: `p${"b".repeat(32)}.onspool.page`,
			url: `https://p${"b".repeat(32)}.onspool.page/`,
		};
		expect(publicationResponseSchemaForOrigin("https://spool.page").safeParse(production).success).toBe(true);
		expect(publicationResponseSchemaForOrigin("https://beta.spool.page").safeParse(production).success).toBe(false);
	});
});
