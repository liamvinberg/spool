import { expect, it } from "vitest";
import { personName } from "./person-name";

it("names a person by their account's name, or by their address before the @ until they give one", () => {
	expect(personName({ name: "Kim Berg", email: "kim.berg@client.com" })).toBe("Kim Berg");
	expect(personName({ name: null, email: "kim.berg@client.com" })).toBe("kim.berg");
	expect(personName({ email: "ola@client.com" })).toBe("ola");
	// a name with an @ in it is still the name
	expect(personName({ name: "Ana @ Tidemark", email: "ana@tidemark.app" })).toBe("Ana @ Tidemark");
});
