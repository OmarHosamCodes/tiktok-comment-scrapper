import "@fontsource/inter/300.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "@fontsource/inter/900.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./globals.css";
import { useRouter } from "./hooks/use-router.ts";
import { BoardPage } from "./pages/BoardPage.tsx";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: false,
		},
	},
});

function Router() {
	const { page, slug, navigateToHome, navigateToBoard } = useRouter();

	if (page === "board" && slug) {
		return <BoardPage slug={slug} onBack={navigateToHome} />;
	}

	return <App navigateToBoard={navigateToBoard} />;
}

const root = document.getElementById("root");
if (root) {
	createRoot(root).render(
		<QueryClientProvider client={queryClient}>
			<Router />
		</QueryClientProvider>,
	);
}
