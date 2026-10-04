/**
 * DEV-158: the team every take on signing in and running a team draws.
 * Tidemark again (DEV-121's team), now with DEV-118's roles. Ada is "you" and an
 * admin. Hues and initials match shared/ui/explore/cloud/home/parts.tsx so a face
 * reads as the same person across both questions.
 */

export type Role = "admin" | "editor" | "viewer";

export interface Person {
	id: string;
	name: string;
	email: string;
	initials: string;
	hue: string;
	role: Role;
	/** how they last signed in, shown only where it helps an admin */
	via: "Google" | "email code" | "passkey";
	joined: string;
	/** where they are right now, if anywhere */
	here?: string;
}

export interface Invite {
	email: string;
	role: Role;
	invitedBy: string;
	sent: string;
	state: "pending" | "expired";
}

export interface Share {
	project: string;
	/** the pages that are shared, by name */
	pages: string[];
	kind: "people" | "link";
	/** named outsiders, for a people share */
	people?: string[];
	by: string;
	when: string;
	opens: number;
}

export const TEAM_NAME = "Tidemark";
export const TEAM_SLUG = "tidemark";
export const YOU = "ada";

export const PEOPLE: Person[] = [
	{ id: "ada", name: "Ada Lind", email: "ada@tidemark.app", initials: "AL", hue: "#D59A6A", role: "admin", via: "passkey", joined: "March", here: "tidemark app" },
	{ id: "jonas", name: "Jonas Berg", email: "jonas@tidemark.app", initials: "JB", hue: "#7FA7D4", role: "admin", via: "Google", joined: "March", here: "tidemark app" },
	{ id: "mira", name: "Mira Koskinen", email: "mira@tidemark.app", initials: "MK", hue: "#9DBE86", role: "editor", via: "Google", joined: "April", here: "tidemark app" },
	{ id: "sam", name: "Sam Okafor", email: "sam@tidemark.app", initials: "SO", hue: "#C49AD3", role: "editor", via: "email code", joined: "June", here: "onboarding" },
	{ id: "lena", name: "Lena Holm", email: "lena.holm@gmail.com", initials: "LH", hue: "#D4C27F", role: "viewer", via: "Google", joined: "September" },
];

export const INVITES: Invite[] = [
	{ email: "noor@tidemark.app", role: "editor", invitedBy: "jonas", sent: "2 days ago", state: "pending" },
	{ email: "eli@studio-eli.se", role: "viewer", invitedBy: "ada", sent: "9 days ago", state: "expired" },
];

/** Outsiders: accounts with shared pages and no membership. They appear only here. */
export const SHARES: Share[] = [
	{ project: "tidemark app", pages: ["checkout"], kind: "people", people: ["kim@harbourbank.se", "ola.n@harbourbank.se"], by: "mira", when: "3 days ago", opens: 14 },
	{ project: "tidemark app", pages: ["onboarding", "receipt"], kind: "link", by: "jonas", when: "last week", opens: 41 },
	{ project: "tidemark site", pages: ["landing"], kind: "people", people: ["press@tidemark.app"], by: "ada", when: "yesterday", opens: 2 },
];

/** Another team Ada is in, for the switcher, and one that has invited her. */
export const OTHER_TEAMS = [{ name: "Northlight", hue: "#6B4E2E", people: 2, role: "editor" as Role }];
export const INVITED_TO = { team: "Harbour Bank", hue: "#3D4E8A", by: "kim@harbourbank.se", role: "viewer" as Role };

export const ROLE_LABEL: Record<Role, string> = { admin: "Admin", editor: "Editor", viewer: "Viewer" };

/** One line each, in the voice the role menu and the invite field should use. */
export const ROLE_SAYS: Record<Role, string> = {
	admin: "Edits, and runs the team: people, roles, billing.",
	editor: "Holds the projects on their Mac. Their saves reach the team.",
	viewer: "Sees every project live in the browser. Never gets the files.",
};

/** DEV-119: every editor is a seat once a team has two. Admins edit, so they count. */
export const seats = (people: Person[] = PEOPLE) => people.filter((person) => person.role !== "viewer").length;

export const person = (id: string): Person => PEOPLE.find((item) => item.id === id) ?? PEOPLE[0]!;
export const admins = (people: Person[] = PEOPLE) => people.filter((item) => item.role === "admin");
