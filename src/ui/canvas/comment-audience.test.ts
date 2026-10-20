import { describe, expect, it } from "vitest";
import {
	audienceLabel,
	audienceOf,
	audiencesOn,
	composerNote,
	outsiderNote,
	replyNote,
	replyPlaceholder,
} from "./comment-audience";

describe("a comment's audience, said (spool#174)", () => {
	const link = audienceOf({ id: "s1", kind: "link", people: [], pages: ["app"] });
	const ines = audienceOf({ id: "s2", kind: "people", people: ["ines@torsgatan.se"], pages: ["app", "site"] });
	const two = audienceOf({ id: "s3", kind: "people", people: ["ines@torsgatan.se", "ola@torsgatan.se"], pages: [] });

	it("offers the shares of the comment's page alone", () => {
		expect(audiencesOn([link, ines, two], "site").map((share) => share.id)).toEqual(["s2"]);
		expect(audiencesOn([link, ines, two], "app").map((share) => share.id)).toEqual(["s1", "s2"]);
	});

	it("names a share by whom it names, or as a link's", () => {
		expect(audienceLabel(link)).toBe("Link share");
		expect(audienceLabel(ines)).toBe("ines");
		expect(audienceLabel(two)).toBe("ines and ola");
		expect(replyPlaceholder({ share: { kind: "people", who: ["Ines"], by: null } })).toBe("Reply to Ines");
		expect(replyPlaceholder({})).toBe("Reply");
	});

	it("says who outside the team reads it", () => {
		expect(composerNote(link)).toBe("Everyone signed in through the link reads this and its replies.");
		expect(composerNote(ines)).toBe("ines reads this and its replies, outside the team.");
		expect(replyNote(two)).toBe("ines and ola read replies, outside the team.");
		expect(outsiderNote("kaffe", link)).toBe("The kaffe team and everyone signed in through this link read it.");
		expect(outsiderNote("kaffe", ines)).toBe("The kaffe team and ines read it.");
	});
});
