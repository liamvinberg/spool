import { useMemo } from "react";
import { encode } from "uqr";
import { cn } from "./cn";

/**
 * A link as a QR code, for a phone's camera to open. It is dark on white in both themes, the one place the chrome
 * holds colours outside its roles: cameras read a code reliably only that way round, so the colours are the code's
 * own, never the look's.
 */
export function QrCode({ value, size, className }: { value: string; size: number; className?: string | undefined }) {
	const path = useMemo(() => {
		const { data } = encode(value, { ecc: "M", border: 0 });
		let d = "";
		data.forEach((row, y) => {
			let x = 0;
			while (x < row.length) {
				if (!row[x]) {
					x += 1;
					continue;
				}
				const from = x;
				while (x < row.length && row[x]) x += 1;
				d += `M${from} ${y}h${x - from}v1h${from - x}z`;
			}
		});
		return { d, size: data.length };
	}, [value]);
	return (
		<div
			data-qr={value}
			className={cn("shrink-0 rounded-sm p-2", className)}
			style={{ width: size, height: size, background: "white" }}
		>
			<svg
				viewBox={`0 0 ${path.size} ${path.size}`}
				className="block h-full w-full"
				shapeRendering="crispEdges"
				role="img"
				aria-label={`QR code for ${value}`}
			>
				<path d={path.d} fill="black" />
			</svg>
		</div>
	);
}
