import { useState } from "react";
import { SleeveModern } from "shared/ui/site/sleeve-guide/modern";
import "./consent.css";

export function ConsentStudy({ placement }: { placement: "strip" | "corner" }) {
	const [visible, setVisible] = useState(true);
	const [customize, setCustomize] = useState(false);
	return (
		<div className="consent-study">
			<SleeveModern take="play" />
			{visible && (
				<section
					className={`consent-study-banner consent-study-${placement}`}
					aria-label="Optional website measurement"
				>
					<div>
						<p>Help improve spool?</p>
						<p>
							With your permission, PostHog measures visits and download clicks, and reports website errors. It
							uses browser storage. Both are optional.{" "}
							<button type="button" className="consent-study-link" onClick={() => setCustomize(true)}>
								Privacy &amp; cookies
							</button>
						</p>
					</div>
					{customize && (
						<fieldset>
							<legend>Your choice</legend>
							<label>
								<input type="checkbox" /> Website analytics
							</label>
							<label>
								<input type="checkbox" /> Error reports
							</label>
						</fieldset>
					)}
					<div className="consent-study-actions">
						<button type="button" onClick={() => setVisible(false)}>
							Reject optional
						</button>
						<button type="button" onClick={() => setVisible(false)}>
							{customize ? "Save choice" : "Allow both"}
						</button>
						{!customize && (
							<button type="button" className="consent-study-link" onClick={() => setCustomize(true)}>
								Choose separately
							</button>
						)}
					</div>
				</section>
			)}
		</div>
	);
}
