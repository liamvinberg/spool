import assert from "node:assert/strict";
import test from "node:test";
import { answersTabs, closeWindowKey, DEFAULT_MENU_KEYS, menuKey, reportedMenuKeys, tabItem } from "./menu-keys";

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

test("a page from before the tab keys keeps ⌘W on Close Window and gets no tab items", () => {
	const reported = reportedMenuKeys({ "app.settings": "CmdOrCtrl+," });
	assert.equal(answersTabs(reported), false);
	assert.equal(closeWindowKey(reported), "CmdOrCtrl+W");
	assert.equal(tabItem("app.reopen-tab", "Reopen Closed Tab", reported), undefined);
});

test("a page answering the tab keys gives ⌘W to Close Tab and Close Window its own key", () => {
	const reported = reportedMenuKeys({
		"app.close-tab": "CmdOrCtrl+W",
		"app.close-window": "CmdOrCtrl+Shift+W",
		"app.next-tab": "Ctrl+Tab",
		"app.tab-3": "CmdOrCtrl+3",
	});
	assert.equal(answersTabs(reported), true);
	assert.equal(closeWindowKey(reported), "CmdOrCtrl+Shift+W");
	assert.deepEqual(tabItem("app.close-tab", "Close Tab", reported), {
		command: "app.close-tab",
		label: "Close Tab",
		accelerator: "CmdOrCtrl+W",
		visible: true,
	});
	assert.equal(tabItem("app.tab-3", "Select Tab 3", reported, false)?.visible, false);
	assert.equal(tabItem("app.previous-tab", "Select Previous Tab", reported), undefined);
});

test("Close Window wears no key when the page answers tabs but names none for it", () => {
	assert.equal(closeWindowKey(reportedMenuKeys({ "app.close-tab": "CmdOrCtrl+W" })), undefined);
});
