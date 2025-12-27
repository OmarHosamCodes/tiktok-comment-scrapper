import type { Options } from "html-to-image/lib/types";

export const PngExportOptions: Options = {
	backgroundColor: "#0a0a0f",
	pixelRatio: 1.5,
	quality: 0.92,
	skipFonts: true,
	fontEmbedCSS: "",
	preferredFontFormat: "woff2",
	filter: (node: Node) => {
		// Skip link elements that point to external stylesheets
		if (node instanceof HTMLLinkElement) {
			const href = node.getAttribute("href");
			if (href?.includes("fonts.googleapis.com")) {
				return false;
			}
		}
		return true;
	},
};
