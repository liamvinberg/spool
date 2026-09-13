import antigravity from "./agent-app-assets/antigravity.png";
import chatgpt from "./agent-app-assets/chatgpt.png";
import claude from "./agent-app-assets/claude.png";

// Original monochrome marks: Claude and ChatGPT desktop template assets;
// Antigravity's white icon from https://antigravity.google/press.
// Masking preserves each mark's geometry and follows the row's text color.
const LOGOS = {
	claude: { image: claude, size: 24 },
	chatgpt: { image: chatgpt, size: 18 },
	antigravity: { image: antigravity, size: 27 },
};

export function AppLogo({ app }: { app: keyof typeof LOGOS }) {
	const logo = LOGOS[app];
	return (
		<span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center">
			<span
				className="block bg-current"
				style={{
					width: logo.size,
					height: logo.size,
					maskImage: `url(${logo.image})`,
					maskSize: "contain",
					maskPosition: "center",
					maskRepeat: "no-repeat",
				}}
			/>
		</span>
	);
}
