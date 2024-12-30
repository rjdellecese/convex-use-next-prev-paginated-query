import { act, render, renderHook, waitFor } from "@testing-library/react";
import {
	ConvexProvider,
	ConvexReactClient,
	type OptionalRestArgsOrSkip,
	useQuery,
} from "convex/react";
import type {
	FunctionReference,
	PaginationOptions,
	PaginationResult,
} from "convex/server";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, vi } from "vitest";
import { describe, expect, it } from "vitest";
import { type Result, useNextPrevPaginatedQuery } from "../index";

type MockedQuery = FunctionReference<
	"query",
	"public",
	{ paginationOpts: PaginationOptions },
	PaginationResult<{ id: number; value: string }>
>;

const mockedQuery = "mockedQuery" as unknown as MockedQuery;

const mockedQueryDuplicate = "mockedQueryDuplicate" as unknown as MockedQuery;

const mockedDocs = Array.from({ length: 10 }, (_, i) => ({
	id: i,
	value: `Item ${i}`,
}));

const mockUseQuery = (
	_query: MockedQuery,
	...[args]: OptionalRestArgsOrSkip<MockedQuery>
): MockedQuery["_returnType"] | undefined => {
	const [result, setResult] = useState<MockedQuery["_returnType"]>();

	// biome-ignore lint/correctness/useExhaustiveDependencies:
	useEffect(() => {
		setResult(undefined);

		if (args === "skip") {
			return;
		}

		const timeoutId = setTimeout(() => {
			const { cursor, numItems } = args.paginationOpts;

			const page =
				cursor === null
					? mockedDocs.slice(0, numItems)
					: mockedDocs
							.filter((doc) => doc.id > Number.parseInt(cursor))
							.slice(0, numItems);

			const lastId = page[page.length - 1]?.id;
			if (lastId === undefined) {
				throw new Error("Last ID is undefined");
			}

			const isDone = lastId === mockedDocs[mockedDocs.length - 1]?.id;

			setResult({
				page,
				continueCursor: lastId.toString(),
				isDone,
			});
		}, 0);

		return () => clearTimeout(timeoutId);
	}, [args === "skip" ? "skip" : JSON.stringify(args), _query]);

	return args === "skip" ? undefined : result;
};

describe("useNextPrevPaginatedQuery", () => {
	describe("with mocked useQuery", () => {
		beforeEach(() => {
			vi.mock("convex/react");
			vi.mocked(useQuery).mockImplementation(mockUseQuery as typeof useQuery);
		});

		afterEach(() => {
			vi.resetAllMocks();
		});

		it("should throw error for invalid initialNumItems", () => {
			expect(() =>
				renderHook(() =>
					useNextPrevPaginatedQuery(mockedQuery, {}, { initialNumItems: 0 }),
				),
			).toThrow("Initial number of items must be greater than zero");
		});

		it("should start in loading state and transition to results", async () => {
			const { result } = renderHook(() =>
				useNextPrevPaginatedQuery(mockedQuery, {}, { initialNumItems: 3 }),
			);

			expect(result.current._tag).toBe("LoadingInitialResults");

			await waitFor(() => {
				expect(result.current._tag).toBe("Loaded");
			});

			ifLoaded(result.current, (result) => {
				expect(result.page).toEqual(mockedDocs.slice(0, 3));
				expect(result.loadNext).toBeTruthy();
				expect(result.loadPrev).toBeNull();
			});
		});

		it("should handle navigation correctly", async () => {
			const { result } = renderHook(() =>
				useNextPrevPaginatedQuery(mockedQuery, {}, { initialNumItems: 3 }),
			);

			expect(result.current._tag).toBe("LoadingInitialResults");

			await waitFor(() => {
				expect(result.current._tag).toBe("Loaded");
			});

			await act(async () => {
				ifLoaded(result.current, (result) => {
					result.loadNext?.();
				});
			});

			await waitFor(() => {
				expect(result.current._tag).toBe("Loaded");
			});

			ifLoaded(result.current, (result) => {
				expect(result.page).toEqual(mockedDocs.slice(3, 6));
				expect(result.loadNext).toBeTruthy();
				expect(result.loadPrev).toBeTruthy();
			});
		});

		it("should handle reaching the end of pagination", async () => {
			const { result } = renderHook(() =>
				useNextPrevPaginatedQuery(mockedQuery, {}, { initialNumItems: 8 }),
			);

			expect(result.current._tag).toBe("LoadingInitialResults");

			await waitFor(() => {
				expect(result.current._tag).toBe("Loaded");
			});

			await act(async () => {
				ifLoaded(result.current, (result) => {
					result.loadNext?.();
				});
			});

			expect(result.current._tag).toBe("LoadingNextResults");

			await waitFor(() => {
				expect(result.current._tag).toBe("Loaded");
			});

			ifLoaded(result.current, (result) => {
				expect(result.page).toEqual(mockedDocs.slice(8));
				expect(result.loadNext).toBeNull();
				expect(result.loadPrev).toBeTruthy();
			});
		});

		it("should handle skip argument", async () => {
			const { result } = renderHook(() =>
				useNextPrevPaginatedQuery(mockedQuery, "skip", { initialNumItems: 3 }),
			);

			expect(result.current._tag).toBe("Skipped");
		});

		it("should update the results when the query args change", async () => {
			const { result, rerender } = renderHook<
				Result<MockedQuery>,
				{ args: "skip" | Record<string, never> }
			>(
				({ args }) =>
					useNextPrevPaginatedQuery(mockedQuery, args, { initialNumItems: 3 }),
				{ initialProps: { args: "skip" } },
			);

			expect(result.current._tag).toBe("Skipped");

			rerender({ args: {} });

			expect(result.current._tag).toBe("LoadingInitialResults");

			await waitFor(() => {
				expect(result.current._tag).toBe("Loaded");
			});

			ifLoaded(result.current, (result) => {
				expect(result.page).toEqual(mockedDocs.slice(0, 3));
				expect(result.loadNext).toBeTruthy();
				expect(result.loadPrev).toBeNull();
			});
		});

		it("should update the results when the options change", async () => {
			const { result, rerender } = renderHook<
				Result<MockedQuery>,
				{ options: { initialNumItems: number } }
			>(({ options }) => useNextPrevPaginatedQuery(mockedQuery, {}, options), {
				initialProps: { options: { initialNumItems: 3 } },
			});

			expect(result.current._tag).toBe("LoadingInitialResults");

			await waitFor(() => {
				expect(result.current._tag).toBe("Loaded");
			});

			rerender({ options: { initialNumItems: 4 } });

			expect(result.current._tag).toBe("LoadingInitialResults");

			await waitFor(() => {
				expect(result.current._tag).toBe("Loaded");
			});

			ifLoaded(result.current, (result) => {
				expect(result.page).toEqual(mockedDocs.slice(0, 4));
			});
		});

		it("should update the results when the query reference changes", async () => {
			const { result, rerender } = renderHook<
				Result<MockedQuery>,
				{ query: MockedQuery }
			>(
				({ query }) =>
					useNextPrevPaginatedQuery(query, {}, { initialNumItems: 3 }),
				{
					initialProps: { query: mockedQuery },
				},
			);

			expect(result.current._tag).toBe("LoadingInitialResults");

			await waitFor(() => {
				expect(result.current._tag).toBe("Loaded");
			});

			rerender({ query: mockedQueryDuplicate });

			expect(result.current._tag).toBe("LoadingInitialResults");

			await waitFor(() => {
				expect(result.current._tag).toBe("Loaded");
			});

			ifLoaded(result.current, (result) => {
				expect(result.page).toEqual(mockedDocs.slice(0, 3));
			});
		});
	});

	describe("without mocked useQuery", () => {
		it("should render without error", () => {
			const TestComponent = () => {
				const result = useNextPrevPaginatedQuery(
					mockedQuery,
					{},
					{ initialNumItems: 3 },
				);

				if (result._tag === "LoadingInitialResults") {
					return <div>Loading…</div>;
				}

				if (result._tag === "Loaded") {
					return (
						<ul>
							{result.page.map((item) => (
								<li key={item.id}>{item.value}</li>
							))}
						</ul>
					);
				}

				throw new Error("Invalid state");
			};

			const convexClient = new ConvexReactClient("http://localhost:3000");

			expect(() =>
				render(
					<ConvexProvider client={convexClient}>
						<TestComponent />
					</ConvexProvider>,
				),
			).not.toThrow();
		});
	});

	const ifLoaded = (
		result: Result<MockedQuery>,
		f: (result: Extract<Result<MockedQuery>, { _tag: "Loaded" }>) => void,
	) => {
		if (result._tag === "Loaded") {
			f(result);
		} else {
			expect.fail("Expected Loaded state");
		}
	};
});
