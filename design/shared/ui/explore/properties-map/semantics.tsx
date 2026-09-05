import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

interface Measurement {
	width: number;
	height: number;
	cssWidth: string;
	contentWidth: number;
	interval: number | null;
	gap: string;
}

function pixels(value: number | undefined): string {
	return value === undefined ? "…" : `${Number(value.toFixed(1))}px`;
}

function Choice({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: string;
	options: readonly string[];
	onChange: (value: string) => void;
}) {
	return (
		<div className="mapping-choice" aria-label={label}>
			{options.map((option) => (
				<button type="button" key={option} aria-pressed={option === value} onClick={() => onChange(option)}>
					{option}
				</button>
			))}
		</div>
	);
}

function Result({ label, value }: { label: string; value: string }) {
	return (
		<div className="mapping-result">
			<span>{label}</span>
			<strong>{value}</strong>
		</div>
	);
}

function Case({
	title,
	detail,
	controls,
	children,
	source,
	results,
	note,
}: {
	title: string;
	detail: string;
	controls: ReactNode;
	children: ReactNode;
	source: string;
	results: ReactNode;
	note: string;
}) {
	return (
		<section className="mapping-case">
			<div className="mapping-case-heading">
				<h2>{title}</h2>
				<p>{detail}</p>
			</div>
			<div className="mapping-controls">{controls}</div>
			<div className="mapping-stage">{children}</div>
			<code className="mapping-source">{source}</code>
			<div className="mapping-results">{results}</div>
			<p className="mapping-note">{note}</p>
		</section>
	);
}

export function MappingCases() {
	const root = useRef<HTMLDivElement | null>(null);
	const [blockMode, setBlockMode] = useState("Auto");
	const [parentWidth, setParentWidth] = useState(460);
	const [axis, setAxis] = useState("Row");
	const [fillMode, setFillMode] = useState("Share space");
	const [box, setBox] = useState("Border box");
	const [width, setWidth] = useState(220);
	const [distribution, setDistribution] = useState("Between");
	const [gap, setGap] = useState(16);
	const [measurements, setMeasurements] = useState<Record<string, Measurement>>({});
	const column = axis === "Column";
	const share = fillMode === "Share space";
	const revision = [blockMode, parentWidth, axis, fillMode, box, width, distribution, gap].join("/");
	useLayoutEffect(() => {
		const held = root.current;
		if (!held) return;
		let live = true;
		const read = () => {
			if (!live) return;
			const next: Record<string, Measurement> = {};
			for (const element of held.querySelectorAll<HTMLElement>("[data-measure]")) {
				const key = element.dataset.measure;
				if (!key) continue;
				const rect = element.getBoundingClientRect();
				const css = getComputedStyle(element);
				const first = element.children[0]?.getBoundingClientRect();
				const second = element.children[1]?.getBoundingClientRect();
				const border = Number.parseFloat(css.borderLeftWidth) + Number.parseFloat(css.borderRightWidth);
				const padding = Number.parseFloat(css.paddingLeft) + Number.parseFloat(css.paddingRight);
				next[key] = {
					width: rect.width,
					height: rect.height,
					cssWidth: css.width,
					contentWidth: rect.width - border - padding,
					interval: first && second ? second.left - first.right : null,
					gap: css.columnGap,
				};
			}
			setMeasurements(next);
		};
		read();
		const observer = new ResizeObserver(read);
		for (const element of held.querySelectorAll("[data-measure]")) observer.observe(element);
		void document.fonts.ready.then(read);
		return () => {
			live = false;
			observer.disconnect();
		};
	}, [revision]);
	const blockRead = measurements.block;
	const flexRead = measurements.flex;
	const peerRead = measurements.peer;
	const boxRead = measurements.box;
	const gapRead = measurements.gap;
	return (
		<div ref={root} className="mapping-lab">
			<style>{`
			.mapping-lab { height:100%; background:#151715; color:#e9eae3; padding:34px 42px 26px; font-size:13px; }
			.mapping-lab * { box-shadow:none; }
			.mapping-header { display:flex; align-items:flex-end; justify-content:space-between; margin-bottom:24px; }
			.mapping-header h1 { font-size:27px; font-weight:500; letter-spacing:-.75px; line-height:1.2; }
			.mapping-header p { margin-top:8px; color:#a0a49a; font-size:13px; }
			.mapping-header button { border:1px solid #454a41; padding:7px 12px; border-radius:5px; color:#c8cec0; font-size:12px; }
			.mapping-grid { display:grid; grid-template-columns:1fr 1fr; gap:22px 28px; }
			.mapping-case { min-width:0; border-top:1px solid #484d43; padding-top:16px; }
			.mapping-case-heading h2 { font-size:16px; font-weight:500; letter-spacing:-.2px; }
			.mapping-case-heading p { color:#a0a49a; font-size:12px; margin-top:4px; }
			.mapping-controls { display:flex; align-items:center; justify-content:space-between; gap:12px; height:54px; }
			.mapping-choice { display:flex; gap:3px; }
			.mapping-choice button { padding:5px 9px; color:#aeb4a5; border:1px solid transparent; border-radius:4px; font-size:11px; white-space:nowrap; }
			.mapping-choice button[aria-pressed=true] { background:#303729; color:#e0edcd; border-color:#586748; }
			.mapping-controls label { display:flex; align-items:center; gap:9px; color:#a0a49a; font-size:11px; white-space:nowrap; }
			.mapping-controls input { width:105px; accent-color:#bdd695; }
			.mapping-stage { height:141px; display:flex; align-items:center; justify-content:center; background:#1d201b; border:1px solid #353a30; padding:10px 14px; overflow:hidden; }
			.mapping-parent { outline:1px dashed #717d62; background:#23291e; }
			.mapping-target { background:#bfd49d; color:#24301a; border:1px solid #d4e4b6; padding:10px 14px; font-size:12px; line-height:20px; }
			.mapping-peer { background:#4b5840; color:#e2e9d8; padding:8px 0; text-align:center; overflow:hidden; font-size:11px; line-height:20px; }
			.mapping-source { display:block; min-height:45px; padding-top:12px; font-family:var(--font-mono); font-size:10px; line-height:16px; color:#a5b394; overflow-wrap:anywhere; }
			.mapping-results { display:flex; gap:24px; border-top:1px solid #30352b; padding-top:9px; }
			.mapping-result { display:flex; flex-direction:column; gap:3px; }
			.mapping-result span { color:#919b85; font-size:10px; }
			.mapping-result strong { font-family:var(--font-mono); font-size:13px; font-weight:400; color:#dbe8c9; }
			.mapping-note { color:#b3b9a9; font-size:11px; line-height:17px; margin-top:12px; max-width:570px; min-height:34px; }
			.mapping-footer { display:flex; justify-content:space-between; color:#7f8974; border-top:1px solid #333a2d; padding-top:14px; margin-top:20px; font-size:11px; }
		`}</style>
			<header className="mapping-header">
				<div>
					<h1>One property. Different layouts.</h1>
					<p>Change the controls. The browser measures every result.</p>
				</div>
				<button
					type="button"
					onClick={() => {
						setBlockMode("Auto");
						setParentWidth(460);
						setAxis("Row");
						setFillMode("Share space");
						setBox("Border box");
						setWidth(220);
						setDistribution("Between");
						setGap(16);
					}}
				>
					Reset cases
				</button>
			</header>
			<div className="mapping-grid">
				<Case
					title="Auto width can fill a line"
					detail="A normal block, inside an adjustable parent."
					controls={
						<>
							<Choice
								label="Block width"
								value={blockMode}
								options={["Auto", "Fit content"]}
								onChange={setBlockMode}
							/>
							<label>
								Parent{" "}
								<input
									aria-label="Block parent width"
									type="range"
									min="280"
									max="540"
									step="10"
									value={parentWidth}
									onChange={(event) => setParentWidth(Number(event.currentTarget.value))}
								/>
								{parentWidth}px
							</label>
						</>
					}
					source={
						blockMode === "Auto"
							? "display: block; width: auto;  // block w-auto"
							: "display: block; width: fit-content;  // block w-fit"
					}
					results={
						<>
							<Result label="Rendered width" value={pixels(blockRead?.width)} />
							<Result label="Parent width" value={`${parentWidth}px`} />
							<Result label="Computed width" value={blockRead?.cssWidth ?? "…"} />
						</>
					}
					note={
						blockMode === "Auto"
							? "No fixed width is authored. The block still takes the available line width."
							: "Fit content makes the box respond to its words, within the available space."
					}
				>
					<div className="mapping-parent" style={{ width: parentWidth }}>
						<div
							data-measure="block"
							className="mapping-target"
							style={{ display: "block", width: blockMode === "Auto" ? "auto" : "fit-content" }}
						>
							A quieter weekend
						</div>
					</div>
				</Case>
				<Case
					title="Fill depends on the parent axis"
					detail="Two flexible children share space beside a fixed item."
					controls={
						<>
							<Choice label="Flex direction" value={axis} options={["Row", "Column"]} onChange={setAxis} />
							<Choice
								label="Fill recipe"
								value={fillMode}
								options={["Share space", "100% size"]}
								onChange={setFillMode}
							/>
						</>
					}
					source={
						share
							? "flex: 1 1 0%; min-width: 0; min-height: 0;  // flex-1 min-w-0 min-h-0"
							: `${column ? "height" : "width"}: 100%; flex: 0 1 auto;  // ${column ? "h-full" : "w-full"}`
					}
					results={
						<>
							<Result
								label={column ? "Selected height" : "Selected width"}
								value={pixels(column ? flexRead?.height : flexRead?.width)}
							/>
							<Result
								label={column ? "Peer height" : "Peer width"}
								value={pixels(column ? peerRead?.height : peerRead?.width)}
							/>
							<Result label="Parent direction" value={axis.toLowerCase()} />
						</>
					}
					note={
						share
							? "The selected item and its peer receive equal shares on the main axis."
							: "A 100% preferred size competes with the peer. The browser can shrink both."
					}
				>
					<div
						className="mapping-parent"
						style={{ display: "flex", flexDirection: column ? "column" : "row", width: 460, height: 124, gap: 8 }}
					>
						<div
							style={{
								flex: `0 0 ${column ? 24 : 72}px`,
								background: "#333c2b",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								color: "#a6b19a",
								fontSize: 10,
							}}
						>
							fixed
						</div>
						<div
							data-measure="flex"
							className="mapping-target"
							style={{
								flex: share ? "1 1 0%" : "0 1 auto",
								minWidth: 0,
								minHeight: 0,
								width: !share && !column ? "100%" : undefined,
								height: !share && column ? "100%" : undefined,
								padding: 0,
								border: 0,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								overflow: "hidden",
								whiteSpace: "nowrap",
							}}
						>
							Selected
						</div>
						<div
							data-measure="peer"
							className="mapping-peer"
							style={{
								flex: "1 1 0%",
								minWidth: 0,
								minHeight: 0,
								padding: 0,
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								whiteSpace: "nowrap",
							}}
						>
							Peer
						</div>
					</div>
				</Case>
				<Case
					title="Width has a box boundary"
					detail="The same width, with 24px padding and a 2px border."
					controls={
						<>
							<Choice label="Box sizing" value={box} options={["Border box", "Content box"]} onChange={setBox} />
							<label>
								Width{" "}
								<input
									aria-label="Authored box width"
									type="range"
									min="160"
									max="320"
									step="10"
									value={width}
									onChange={(event) => setWidth(Number(event.currentTarget.value))}
								/>
								{width}px
							</label>
						</>
					}
					source={`box-sizing: ${box === "Border box" ? "border-box" : "content-box"}; width: ${width}px; padding: 24px; border: 2px solid;`}
					results={
						<>
							<Result label="Authored width" value={`${width}px`} />
							<Result label="Rendered border box" value={pixels(boxRead?.width)} />
							<Result label="Measured content area" value={pixels(boxRead?.contentWidth)} />
						</>
					}
					note={
						box === "Border box"
							? "Padding and border fit inside the authored width. The content has less room."
							: "Padding and border add to the content width. The outside of the box grows."
					}
				>
					<div
						data-measure="box"
						style={{
							boxSizing: box === "Border box" ? "border-box" : "content-box",
							width,
							padding: 24,
							border: "2px solid #d4e4b6",
							background: "#687c50",
						}}
					>
						<div
							style={{
								height: 36,
								background: "#bfd49d",
								color: "#24301a",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								fontSize: 11,
							}}
						>
							Content
						</div>
					</div>
				</Case>
				<Case
					title="The visible interval can exceed gap"
					detail="Three fixed-width items inside a 460px row."
					controls={
						<>
							<Choice
								label="Gap distribution"
								value={distribution}
								options={["Start", "Between"]}
								onChange={setDistribution}
							/>
							<label>
								Gap{" "}
								<input
									aria-label="Explicit gap"
									type="range"
									min="0"
									max="48"
									step="4"
									value={gap}
									onChange={(event) => setGap(Number(event.currentTarget.value))}
								/>
								{gap}px
							</label>
						</>
					}
					source={`display: flex; gap: ${gap}px; justify-content: ${distribution === "Between" ? "space-between" : "flex-start"};`}
					results={
						<>
							<Result label="Authored gap" value={`${gap}px`} />
							<Result label="Computed column gap" value={gapRead?.gap ?? "…"} />
							<Result
								label="Measured first interval"
								value={gapRead?.interval == null ? "…" : pixels(gapRead.interval)}
							/>
						</>
					}
					note={
						distribution === "Between"
							? "Space between distributes the remaining room. A gap edit can leave the interval unchanged."
							: "Start alignment leaves spare room at the end. The interval now follows the explicit gap."
					}
				>
					<div
						data-measure="gap"
						className="mapping-parent"
						style={{
							display: "flex",
							gap,
							width: 460,
							justifyContent: distribution === "Between" ? "space-between" : "flex-start",
						}}
					>
						{["One", "Two", "Three"].map((label) => (
							<div
								key={label}
								className="mapping-target"
								style={{
									flex: "0 0 80px",
									height: 60,
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									padding: 0,
								}}
							>
								{label}
							</div>
						))}
					</div>
				</Case>
			</div>
			<footer className="mapping-footer">
				<span>Live CSS cases. Each readout comes from the rendered elements.</span>
				<span>Properties need their layout context.</span>
			</footer>
		</div>
	);
}
