import { useCallback, useEffect, useState } from "react";

interface RouteState {
	page: "home" | "board";
	slug?: string;
}

function parseRoute(): RouteState {
	const hash = window.location.hash.slice(1); // Remove #

	if (hash.startsWith("/board/")) {
		const slug = hash.slice(7); // Remove "/board/"
		if (slug) {
			return { page: "board", slug };
		}
	}

	return { page: "home" };
}

export function useRouter() {
	const [route, setRoute] = useState<RouteState>(parseRoute);

	useEffect(() => {
		const handleHashChange = () => {
			setRoute(parseRoute());
		};

		window.addEventListener("hashchange", handleHashChange);
		return () => window.removeEventListener("hashchange", handleHashChange);
	}, []);

	const navigateToBoard = useCallback((slug: string) => {
		window.location.hash = `/board/${slug}`;
	}, []);

	const navigateToHome = useCallback(() => {
		window.location.hash = "";
	}, []);

	return {
		...route,
		navigateToBoard,
		navigateToHome,
	};
}
