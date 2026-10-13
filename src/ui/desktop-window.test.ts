import { describe, expect, it } from "vitest";
import { TAB_COMMANDS as MENU_TAB_COMMANDS } from "../../desktop/src/menu-keys";
import { menuAccelerators, TAB_COMMANDS } from "./desktop-window";

describe("the Mac app's menu keys", () => {
	it("are the register's, as the menu has always worn them", () => {
		expect(menuAccelerators()).toMatchObject({
			"app.new-project": "CmdOrCtrl+N",
			"app.open-project": "CmdOrCtrl+O",
			"app.settings": "CmdOrCtrl+,",
		});
	});

	it("carry the tab keys, each wearing its first combo", () => {
		expect(menuAccelerators()).toMatchObject({
			"app.close-tab": "CmdOrCtrl+W",
			"app.close-window": "CmdOrCtrl+Shift+W",
			"app.reopen-tab": "CmdOrCtrl+Shift+T",
			"app.home": "CmdOrCtrl+T",
			"app.next-tab": "Ctrl+Tab",
			"app.previous-tab": "Ctrl+Shift+Tab",
			"app.tab-1": "CmdOrCtrl+1",
			"app.tab-8": "CmdOrCtrl+8",
			"app.tab-last": "CmdOrCtrl+9",
		});
	});

	it("name the same tab commands the Mac app's menu keys", () => {
		expect([...MENU_TAB_COMMANDS]).toEqual([...TAB_COMMANDS]);
	});
});
