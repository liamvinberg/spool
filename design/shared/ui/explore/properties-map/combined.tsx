import { useProperties } from "shared/lib/explore/properties-map/model";
import { GestureScene } from "shared/ui/explore/properties-map/gestures";
import { VisualRail } from "shared/ui/explore/properties-map/panels";
import { CanvasChrome } from "shared/ui/spool/canvas-chrome";
import { SpoolShell } from "shared/ui/spool/shell";
import "shared/ui/explore/properties-map/combined.css";

export function CombinedProperties() {
	const editor = useProperties();
	return (
		<div className="pm-combined h-full">
			<SpoolShell
				activeTab="weekend"
				tabs={["weekend"]}
				zoom="100%"
				headerAccessory={
					<label className="flex items-center gap-2 text-[10px] text-muted">
						<span>Spacing unit</span>
						<select
							aria-label="Project spacing unit"
							className="bg-transparent font-mono"
							value={editor.step}
							onChange={(event) => editor.setStep(event.target.value === "6" ? 6 : 4)}
						>
							<option value={4}>4 px</option>
							<option value={6}>6 px</option>
						</select>
					</label>
				}
			>
				<CanvasChrome
					pages={[{ name: "weekend", frames: ["stay"], open: true, active: true }]}
					selected="stay"
					tool="edit"
					rail={<VisualRail editor={editor} take="inspector" />}
					railWidth={286}
				>
					<GestureScene editor={editor} context />
					<div className="pointer-events-none absolute inset-x-4 top-14 text-center text-[11px] text-muted/65">
						Drag an inset for padding. Drag the edge for width. Hold Alt for exact spacing.
					</div>
				</CanvasChrome>
			</SpoolShell>
		</div>
	);
}
