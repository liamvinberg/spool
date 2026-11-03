import { describe, expect, it } from "vitest";
import { stampKnobCalls } from "./knob-literals";

/**
 * The knob stamp (#220): every `ui.knobs` call carries its site as a second
 * argument, written where it moves no line and nothing before the paren, so
 * the JSX stamps around it keep their columns.
 */

const FRAME = `import { ui as u } from "spool";
const pad = 4;
const k = u.knobs({
	card: { radius: { type: "corners", value: -20 }, padding: { type: "spacing", value: [pad, 2] } },
	motion: { spring: { type: "spring", value: { duration: 0.35, bounce: 0.3 } }, replay: { type: "action" } },
	label: { type: "text", value: \`Oat\` },
	more: someSpec,
},);
export default function Frame() {
	return <p className="x">{u.knobs({ on: { type: "toggle", value: k.on } })}</p>;
}
`;

describe("stamping ui.knobs calls", () => {
	it("passes each call its site and the paths it computes, moving nothing before its paren", () => {
		const stamped = stampKnobCalls(FRAME, "frames/menu/frame.tsx", "tsx");
		const was = FRAME.split("\n");
		const now = stamped.split("\n");
		expect(now).toHaveLength(was.length);
		expect(now[7]).toBe(`}, {"at":"frames/menu/frame.tsx:3:11","computed":["card.padding","more"]});`);
		expect(now[9]).toBe(
			`\treturn <p className="x">{u.knobs({ on: { type: "toggle", value: k.on } }, {"at":"frames/menu/frame.tsx:10:27","computed":["on"]})}</p>;`,
		);
		for (const [index, line] of was.entries()) {
			if (index !== 7 && index !== 9) expect(now[index]).toBe(line);
		}
	});

	it("leaves a file without a call from spool's ui as it was", () => {
		const own = `import { ui } from "./ui";\nui.knobs({ a: { type: "toggle", value: true } });\n`;
		expect(stampKnobCalls(own, "shared/knobs/a.ts", "ts")).toBe(own);
		const plain = FRAME.replaceAll("u.knobs", "u.state");
		expect(stampKnobCalls(plain, "frames/menu/frame.tsx", "tsx")).toBe(plain);
	});
});
