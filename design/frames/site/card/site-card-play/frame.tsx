import { AppSurface } from "shared/ui/site/sleeve-real/app";
import { SpoolMark } from "shared/ui/spool/mark";

export default function Frame() {
	return (
		<div
			style={{
				width: 1200,
				height: 630,
				position: "relative",
				overflow: "hidden",
				background: "#101010",
				color: "#f0efed",
				fontFamily: '"Instrument Sans", sans-serif',
			}}
		>
			<div
				style={{
					position: "absolute",
					top: 42,
					left: 56,
					display: "flex",
					alignItems: "center",
					gap: 12,
					fontSize: 30,
					fontWeight: 500,
					letterSpacing: "-.04em",
				}}
			>
				<span style={{ width: 22, height: 32, color: "#e55332", display: "flex" }}>
					<SpoolMark />
				</span>
				spool
			</div>
			<span style={{ position: "absolute", top: 52, right: 56, fontSize: 18, color: "#92918c" }}>spool.page</span>
			<h1
				style={{
					position: "absolute",
					top: 111,
					left: 56,
					margin: 0,
					fontSize: 66,
					lineHeight: 1.02,
					fontWeight: 500,
					letterSpacing: "-.055em",
				}}
			>
				A canvas for
				<br />
				working things out.
			</h1>
			<p
				style={{
					position: "absolute",
					top: 143,
					right: 56,
					width: 310,
					margin: 0,
					fontSize: 24,
					lineHeight: 1.4,
					letterSpacing: "-.025em",
					color: "#aaa9a4",
				}}
			>
				Design with your agent.
				<br />
				Try it live. Keep what works.
			</p>
			<div style={{ position: "absolute", top: 293, left: 56, width: 1088 }}>
				<AppSurface view="canvas" />
			</div>
		</div>
	);
}
