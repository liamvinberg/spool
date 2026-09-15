import { z } from "zod";

export const publicationStates = ["staging", "active", "stopped", "suspended"] as const;

const publicationHostname = z.string().regex(/^p[a-f0-9]{32}(?:-beta)?\.onspool\.page$/u);
const publicationUrl = z
	.string()
	.url()
	.refine((value) => {
		try {
			const url = new URL(value);
			return (
				url.protocol === "https:" &&
				url.username === "" &&
				url.password === "" &&
				url.port === "" &&
				url.pathname === "/" &&
				url.search === "" &&
				url.hash === "" &&
				publicationHostname.safeParse(url.hostname).success
			);
		} catch {
			return false;
		}
	});

const publicationResponseFields = z.strictObject({
	id: z.string(),
	projectId: z.string(),
	ownerId: z.string(),
	title: z.string(),
	hostname: publicationHostname,
	url: publicationUrl,
	entry: z.string(),
	scenario: z.string(),
	state: z.enum(publicationStates),
	revision: z.number().int().nonnegative(),
	accessGeneration: z.number().int().positive(),
	currentVersion: z.nullable(z.strictObject({ id: z.string(), contentIdentity: z.string() })),
	invitedEmails: z.array(z.string()),
	createdAt: z.number(),
	updatedAt: z.number(),
});

export const publicationResponseSchema = publicationResponseFields.refine(
	(value) => {
		try {
			return new URL(value.url).hostname === value.hostname;
		} catch {
			return false;
		}
	},
	{ path: ["url"] },
);

export function publicationResponseSchemaForOrigin(origin: string) {
	const expectedIsolated = new URL(origin).origin !== "https://spool.page";
	return publicationResponseSchema.refine((value) => value.hostname.includes("-beta.") === expectedIsolated, {
		path: ["hostname"],
	});
}

export type PublicationResponse = z.infer<typeof publicationResponseSchema>;

const playerPublicationSchema = publicationResponseFields
	.pick({
		id: true,
		url: true,
		invitedEmails: true,
		state: true,
		revision: true,
		accessGeneration: true,
	})
	.strip();

export type PlayerPublication = z.infer<typeof playerPublicationSchema>;

export function playerPublication(value: unknown): PlayerPublication | undefined {
	const parsed = playerPublicationSchema.safeParse(value);
	return parsed.success ? parsed.data : undefined;
}
