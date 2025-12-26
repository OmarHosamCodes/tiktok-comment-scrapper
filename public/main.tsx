import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: false,
		},
	},
});

const root = document.getElementById("root");
if (root) {
	createRoot(root).render(
		<QueryClientProvider client={queryClient}>
			<App />
		</QueryClientProvider>,
	);
}
