import { expect, it, onTestFinished } from "vitest";
import { testBrowser } from "../test-browser";
import { serveProject, writeDesignFile, writeFrame } from "../test-helpers";

/**
 * A walk is one document (DEV-284): stepping from one themed frame to another
 * has to switch the tokens and the fonts along with the frame, and leave
 * neither the last frame's nor the project's behind.
 */
it("walks between two themed frames, each in its own tokens and fonts", { timeout: 60_000 }, async () => {
	const browser = await testBrowser();
	const project = await serveProject();
	writeDesignFile(project.root, "shared/tokens.css", "@theme {\n\t--color-primary: #abcdef;\n}\n");
	writeDesignFile(
		project.root,
		"shared/fonts.css",
		'@font-face { font-family: "ProjectFace"; src: url("data:font/woff2;base64,AAAA"); }\n',
	);
	for (const [theme, colour, family] of [
		["vercel", "#000001", "Geist"],
		["linear", "#000002", "Inter"],
	] as const) {
		writeDesignFile(
			project.root,
			`shared/ui/${theme}/theme.css`,
			`@import "tailwindcss";\n@theme {\n\t--color-primary: ${colour};\n\t--font-sans: "${family}";\n}\n@font-face { font-family: "${family}"; src: url("data:font/woff2;base64,AAAA"); }\n`,
		);
	}
	writeDesignFile(
		project.root,
		"shared/ui/button.tsx",
		'export const Button = ({ to }: { to: string }) => <button id="go" type="button" data-go={to} className="bg-primary font-sans">go</button>;\n',
	);
	writeFrame(
		project.root,
		"vercel",
		'import "shared/ui/vercel/theme.css";\nimport { Button } from "shared/ui/button";\nexport default () => <Button to="linear" />;\n',
	);
	writeFrame(
		project.root,
		"linear",
		'import "shared/ui/linear/theme.css";\nimport { Button } from "shared/ui/button";\nexport default () => <Button to="vercel" />;\n',
	);

	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => context.close());
	const player = await context.newPage();
	await player.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=vercel`);
	const screen = player.frameLocator("#spool-player");
	const look = () =>
		screen.locator("#go").evaluate((button) => {
			const style = getComputedStyle(button);
			const faces = [...document.fonts].map((face) => face.family.replaceAll('"', "")).sort();
			return { background: style.backgroundColor, font: style.fontFamily.replaceAll('"', ""), faces };
		});

	await screen.locator("#go").waitFor();
	expect(await look()).toEqual({ background: "rgb(0, 0, 1)", font: "Geist", faces: ["Geist"] });

	await screen.locator("#go").click();
	await expect
		.poll(look, { timeout: 10_000 })
		.toEqual({ background: "rgb(0, 0, 2)", font: "Inter", faces: ["Inter"] });
});
