import { useEffect, useState } from "react";
import { fetchThumb } from "./api";

type ThumbnailSource = {
	project: string;
	frame: string;
	nonce: number;
	url: string;
};

export function Thumbnail({
	project,
	frame,
	nonce,
	alt,
	...image
}: Omit<React.ComponentPropsWithoutRef<"img">, "src" | "nonce" | "alt"> & {
	project: string;
	frame: string;
	nonce: number;
	alt: string;
}) {
	const [source, setSource] = useState<ThumbnailSource>();

	useEffect(() => {
		let active = true;
		let objectUrl: string | undefined;
		void fetchThumb(project, frame, nonce).then((blob) => {
			if (!active || blob === undefined) return;
			objectUrl = URL.createObjectURL(blob);
			setSource({ project, frame, nonce, url: objectUrl });
		});
		return () => {
			active = false;
			if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl);
		};
	}, [project, frame, nonce]);

	if (source?.project !== project || source.frame !== frame || source.nonce !== nonce) return null;
	return <img {...image} src={source.url} alt={alt} />;
}
