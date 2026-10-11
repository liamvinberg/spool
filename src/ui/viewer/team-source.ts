import { type TeamsSource, teamsAt } from "../team-source";

/**
 * Home's teams in a browser at spool.page: the team API on this page's own origin, with this browser's session.
 * A logo goes as its own bytes.
 */
export const cloudTeams: TeamsSource = teamsAt("/api", {
	fetch: (input, init) => fetch(input, { credentials: "same-origin", ...init }),
	logo: async (image) => ({ headers: { "content-type": "application/octet-stream" }, body: image }),
});
