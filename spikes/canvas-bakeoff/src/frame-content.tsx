// The live document inside a frame: sandboxed null-origin srcdoc iframe (the spool frame model).
// pointer-events: none — manipulating frames is this spike's question; interacting *inside* them is ticket #8.
// memo so canvas re-renders never touch the iframe (a reload would reset in-frame state).

import { memo } from "react";
import type { ScreenId } from "./scene";
import { screens } from "./screens";

export const FrameContent = memo(function FrameContent({ screen }: { screen: ScreenId }) {
	return (
		<iframe
			title={screen}
			sandbox="allow-scripts"
			srcDoc={screens[screen]}
			style={{
				display: "block",
				width: "100%",
				height: "100%",
				border: 0,
				background: "#fff",
				pointerEvents: "none",
			}}
		/>
	);
});
