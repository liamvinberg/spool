import { describe, expect, it } from "vitest";
import { menuAccelerators } from "./desktop-window";

describe("the Mac app's menu keys", () => {
	it("are the register's, as the menu has always worn them", () => {
		expect(menuAccelerators()).toEqual({
			"app.new-project": "CmdOrCtrl+N",
			"app.open-project": "CmdOrCtrl+O",
			"app.settings": "CmdOrCtrl+,",
		});
	});
});
