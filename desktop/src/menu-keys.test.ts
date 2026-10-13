import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_MENU_KEYS, menuKey, reportedMenuKeys } from "./menu-keys";

test("the menu wears the keys the page reports from its register", () => {
	const reported = reportedMenuKeys({ "app.new-project": "CmdOrCtrl+Shift+N", "app.settings": "CmdOrCtrl+," });
	assert.equal(menuKey("app.new-project", reported), "CmdOrCtrl+Shift+N");
	assert.equal(menuKey("app.settings", reported), "CmdOrCtrl+,");
});

test("a page that reports nothing keeps the keys the menu always had", () => {
	const reported = reportedMenuKeys(undefined);
	assert.equal(menuKey("app.new-project", reported), "CmdOrCtrl+N");
	assert.equal(menuKey("app.open-project", reported), "CmdOrCtrl+O");
	assert.equal(menuKey("app.settings", reported), "CmdOrCtrl+,");
	assert.deepEqual(DEFAULT_MENU_KEYS, {
		"app.new-project": "CmdOrCtrl+N",
		"app.open-project": "CmdOrCtrl+O",
		"app.settings": "CmdOrCtrl+,",
	});
});

test("a page cannot key an item that keeps its keys in the page, or send a malformed accelerator", () => {
	const reported = reportedMenuKeys({
		"canvas.zoom-in": "CmdOrCtrl+Plus",
		"app.open-project": "CmdOrCtrl+O; rm -rf",
		"app.settings": 7,
		toString: "CmdOrCtrl+T",
	});
	assert.deepEqual(reported, {});
});

test("every accelerator the page's converter writes for a menu key is taken", () => {
	for (const accelerator of ["CmdOrCtrl+W", "CmdOrCtrl+Shift+]", "Ctrl+Tab", "CmdOrCtrl+Alt+B", "CmdOrCtrl+9"]) {
		assert.equal(reportedMenuKeys({ "app.settings": accelerator })["app.settings"], accelerator);
	}
});
