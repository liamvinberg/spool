// spool's Settings page (design/frames/app/spool-settings) ported by hand to the own-engine vocabulary,
// to see what the port costs and how close it lands.
import { useEffect, useState } from "react";
import { Path, Circle, Pressable, Rect, Svg, Text, View } from "own";

const c = {
	bg: "#121212",
	panel: "#161616",
	line: "#262626",
	text: "#f4f4f5",
	secondary: "#a1a1aa",
	tertiary: "#71717a",
	accent: "#ff4a1c",
	raised: "#232323",
};
const sans = "Instrument Sans";
const mono = "Fragment Mono";

function Toggle({ on: initial }: { on: boolean }) {
	const [on, setOn] = useState(initial);
	const [x, setX] = useState(initial ? 12 : 0);
	useEffect(() => {
		let raf = 0;
		const target = on ? 12 : 0;
		const step = () => {
			setX((v) => {
				const n = v + (target - v) * 0.3;
				if (Math.abs(target - n) > 0.2) raf = requestAnimationFrame(step);
				return Math.abs(target - n) > 0.2 ? n : target;
			});
		};
		raf = requestAnimationFrame(step);
		return () => cancelAnimationFrame(raf);
	}, [on]);
	return (
		<Pressable
			onPress={() => setOn(!on)}
			style={{ width: 28, height: 16, borderRadius: 8, borderWidth: 1, borderColor: on ? c.accent : "#3f3f46", backgroundColor: on ? c.accent : c.raised, justifyContent: "center", paddingHorizontal: 2 }}
		>
			<View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: on ? "#fff" : "#a1a1aa", transform: [{ translateX: x }] }} />
		</Pressable>
	);
}

function Row({ title, body, children }: { title: string; body: string; children?: any }) {
	return (
		<View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingVertical: 18, borderTopWidth: 1, borderTopColor: c.line, gap: 24 }}>
			<View style={{ gap: 6, flexShrink: 1, maxWidth: 430 }}>
				<Text style={{ color: c.text, fontFamily: sans, fontSize: 13, fontWeight: 500 }}>{title}</Text>
				<Text style={{ color: c.secondary, fontFamily: sans, fontSize: 12, lineHeight: 18 }}>{body}</Text>
			</View>
			{children}
		</View>
	);
}

function NavItem({ label, selected, icon }: { label: string; selected?: boolean; icon: any }) {
	const [hover, setHover] = useState(false);
	return (
		<Pressable
			onHoverIn={() => setHover(true)}
			onHoverOut={() => setHover(false)}
			style={{ flexDirection: "row", alignItems: "center", gap: 12, height: 36, paddingHorizontal: 12, borderRadius: 6, backgroundColor: selected ? "#262626" : hover ? "#1f1f1f" : undefined }}
		>
			<Svg viewBox="0 0 16 16" width={16} height={16} color={selected ? c.text : c.secondary}>
				{icon}
			</Svg>
			<Text style={{ color: selected ? c.text : c.secondary, fontFamily: sans, fontSize: 13 }}>{label}</Text>
		</Pressable>
	);
}

export default function Frame() {
	const [where, setWhere] = useState("Ask");
	return (
		<View style={{ width: 1440, height: 900, backgroundColor: c.bg }}>
			<View style={{ height: 44, flexDirection: "row", alignItems: "flex-end", paddingLeft: 8, borderBottomWidth: 1, borderBottomColor: c.line, gap: 4 }}>
				<View style={{ height: 38, width: 96, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, backgroundColor: c.bg, borderTopLeftRadius: 8, borderTopRightRadius: 8, borderWidth: 1, borderColor: c.line }}>
					<Text style={{ color: c.text, fontFamily: sans, fontSize: 13 }}>Home</Text>
				</View>
				{["tvärsö", "kaffe"].map((t) => (
					<View key={t} style={{ height: 38, width: 200, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12 }}>
						<View style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: "#7c4a2d" }} />
						<Text style={{ color: c.secondary, fontFamily: sans, fontSize: 13 }}>{t}</Text>
					</View>
				))}
			</View>
			<View style={{ flex: 1, flexDirection: "row" }}>
				<View style={{ width: 248, borderRightWidth: 1, borderRightColor: c.line, padding: 12, gap: 2 }}>
					<View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 36, paddingHorizontal: 12, marginBottom: 14 }}>
						<Text style={{ color: c.secondary, fontFamily: sans, fontSize: 13 }}>‹  Back to Home</Text>
						<View style={{ borderWidth: 1, borderColor: "#3f3f46", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 }}>
							<Text style={{ color: c.tertiary, fontFamily: mono, fontSize: 11 }}>esc</Text>
						</View>
					</View>
					<Text style={{ color: c.text, fontFamily: sans, fontSize: 13, fontWeight: 500, paddingHorizontal: 12, paddingBottom: 8 }}>Settings</Text>
					<NavItem label="This Mac" selected icon={<Rect x={2} y={3} width={12} height={8} rx={1.5} stroke="currentColor" strokeWidth={1.5} fill="none" />} />
					<NavItem label="Appearance" icon={<Circle cx={8} cy={8} r={5.75} stroke="currentColor" strokeWidth={1.5} fill="none" />} />
					<NavItem label="Colours" icon={<Path d="M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 9h4v4H9z" stroke="currentColor" strokeWidth={1.3} fill="none" />} />
				</View>
				<View style={{ flex: 1, paddingLeft: 48, paddingTop: 40 }}>
					<View style={{ width: 544 }}>
						<Text style={{ color: c.text, fontFamily: sans, fontSize: 28, fontWeight: 500, letterSpacing: -0.4 }}>This Mac</Text>
						<Text style={{ color: c.tertiary, fontFamily: mono, fontSize: 11, marginTop: 6, marginBottom: 28 }}>writes ~/.spool/config.json</Text>
						<Row title="Default project location" body="Used for new projects. Existing projects stay where they are.">
							<View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
								<Text style={{ color: c.secondary, fontFamily: mono, fontSize: 12 }}>~/spool</Text>
								<View style={{ borderWidth: 1, borderColor: "#3f3f46", borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4 }}>
									<Text style={{ color: c.text, fontFamily: sans, fontSize: 12 }}>Change…</Text>
								</View>
							</View>
						</Row>
						<Row title="New projects go to" body="Where spool init starts a project while you edit in a team: ask each time, only this Mac, or one team.">
							<View style={{ flexDirection: "row", borderWidth: 1, borderColor: c.line, borderRadius: 6, padding: 2 }}>
								{["Ask", "Only this Mac", "Northlight", "Tidemark"].map((o) => (
									<Pressable key={o} onPress={() => setWhere(o)} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, backgroundColor: where === o ? "#2a2a2a" : undefined }}>
										<Text style={{ color: where === o ? c.text : c.secondary, fontFamily: mono, fontSize: 11 }}>{o}</Text>
									</Pressable>
								))}
							</View>
						</Row>
						<Row title="Check for updates" body="Once a day, and a line in the canvas when there is one.">
							<Toggle on />
						</Row>
						<Row title="Show threads" body="The arrows between frames and the tags for walks that leave the page. T turns them on and off.">
							<Toggle on />
						</Row>
						<View style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: 28 }}>
							<Text style={{ color: c.tertiary, fontFamily: sans, fontSize: 11, lineHeight: 18 }}>
								spool writes a file when something here moves, only the key that moved. Every other key in it is left the way you typed it.
							</Text>
						</View>
					</View>
				</View>
			</View>
		</View>
	);
}
