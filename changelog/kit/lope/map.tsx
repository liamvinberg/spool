/* The Isle of Dogs and the river around it, drawn dark, with tonight's loop on top. */

const route =
	"M120 262 L124 249 L128 236 L132 216 L136 198 L118 197 L101 194 L86 189 L78 180 L74 168 L77 155 L86 145 L99 138 L118 132 L140 128 L163 125 L186 125 L210 124 L232 127 L252 130 L270 135 L287 140 L299 147 L306 157 L307 168 L303 177 L302 184 L306 206 L310 228 L292 234 L272 238 L251 240 L230 243 L210 245 L192 246 L176 248 L163 252 L150 260";

export function RouteMap({ accent, replay }: { accent: string; replay: number }) {
	return (
		<svg viewBox="0 0 390 330" className="block size-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
			<rect width="390" height="330" fill="#141416" />
			{/* streets north of the water */}
			<g stroke="#232327" strokeWidth="1.5" fill="none">
				<path d="M0 40 C90 30 200 46 390 30" />
				<path d="M40 0 L58 74" />
				<path d="M150 0 L156 82" />
				<path d="M262 0 L254 84" />
				<path d="M340 0 L352 76" />
			</g>
			{/* the Thames */}
			<path
				d="M0 86 C80 74 170 104 250 92 S360 70 390 82 L390 234 C330 244 250 226 170 236 S40 248 0 232 Z"
				fill="#0f1b22"
			/>
			{/* the Isle of Dogs */}
			<path
				d="M70 134 C122 112 232 116 304 136 C324 146 318 176 294 184 C222 200 128 198 80 184 C56 174 54 146 70 134 Z"
				fill="#15201a"
			/>
			<path d="M92 160 C150 150 230 152 294 162" stroke="#1d2a22" strokeWidth="1.5" fill="none" />
			{/* streets of Greenwich */}
			<g stroke="#232327" strokeWidth="1.5" fill="none">
				<path d="M0 270 C110 262 250 280 390 262" />
				<path d="M0 300 C120 292 260 306 390 296" />
				<path d="M64 244 L56 330" />
				<path d="M188 240 L196 330" />
				<path d="M316 236 L330 330" />
			</g>
			{/* bridges */}
			<g stroke="#2c2c30" strokeWidth="5" strokeLinecap="round">
				<path d="M128 236 L136 196" />
				<path d="M302 184 L310 228" />
			</g>
			<g fill="#55555b" fontSize="10.5" fontFamily="Archivo, system-ui" letterSpacing="0.04em">
				<text x="196" y="66">
					River Thames
				</text>
				<text x="164" y="176" fill="#4d6455">
					Isle of Dogs
				</text>
				<text x="214" y="318">
					Greenwich
				</text>
			</g>
			<g key={replay}>
				<path
					d={route}
					pathLength={1}
					fill="none"
					stroke={accent}
					strokeOpacity="0.35"
					strokeWidth="10"
					strokeLinecap="round"
					strokeLinejoin="round"
					className="lope-draw"
					style={{ filter: "blur(5px)" }}
				/>
				<path
					d={route}
					pathLength={1}
					fill="none"
					stroke={accent}
					strokeWidth="4.5"
					strokeLinecap="round"
					strokeLinejoin="round"
					className="lope-draw"
				/>
			</g>
			<circle cx="120" cy="262" r="7" fill="#0b0b0c" stroke="#f4f3ef" strokeWidth="3" />
			<circle cx="150" cy="260" r="7" fill={accent} stroke="#0b0b0c" strokeWidth="3" />
		</svg>
	);
}
