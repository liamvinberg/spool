import { describe, expect, it } from "vitest";
import { makeTempDir } from "../test-helpers";
import { teamPeople } from "./comment-routes";

describe("whom a project's comments mention", () => {
	it("is nobody on a project that isn't a team's, never an error", async () => {
		const people = teamPeople(makeTempDir());
		expect(await people(makeTempDir())).toEqual([]);
	});
});
