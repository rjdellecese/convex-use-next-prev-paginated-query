import { useNextPrevPaginatedQuery } from "convex-use-next-prev-paginated-query";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { api } from "../convex/_generated/api";

const App = () => {
	const convexClient = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

	return (
		<ConvexProvider client={convexClient}>
			<Page />
		</ConvexProvider>
	);
};

const Page = () => {
	const result = useNextPrevPaginatedQuery(
		api.functions.getMessages,
		{
			channel: "general",
		},
		{
			initialNumItems: 10,
		},
	);

	if (result._tag === "LoadingInitialResults") {
		return <div>Loading…</div>;
	}

	if (result._tag === "Loaded") {
		return (
			<ul>
				{result.page.map((item) => (
					<li key={item._id}>{item.content}</li>
				))}
			</ul>
		);
	}

	throw new Error("Invalid state");
};

export default App;
