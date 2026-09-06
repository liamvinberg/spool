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
							Allow visit statistics, session recordings and error reports? Recordings mask text and inputs.
							Uses browser storage. All are optional. Change your choice anytime.{" "}
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
							<label>
								<input type="checkbox" /> Session recordings
							</label>
						</fieldset>
					)}
					<div className="consent-study-actions">
						<button type="button" onClick={() => setVisible(false)}>
							Reject optional
						</button>
						<button type="button" onClick={() => setVisible(false)}>
							{customize ? "Save choice" : "Allow all"}
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
