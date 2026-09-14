import { z } from "zod";

export const publicationStates = ["staging", "active", "stopped", "suspended"] as const;

export const publicationResponseSchema = z.strictObject({
	id: z.string(),
	projectId: z.string(),
	ownerId: z.string(),
	title: z.string(),
	hostname: z.string(),
	url: z.string().url(),
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

export type PublicationResponse = z.infer<typeof publicationResponseSchema>;

const playerPublicationSchema = publicationResponseSchema
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
