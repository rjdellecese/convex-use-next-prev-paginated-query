import { act, renderHook, waitFor } from "@testing-library/react";
import { type OptionalRestArgsOrSkip, useQuery } from "convex/react";
import type {
	FunctionReference,
	PaginationOptions,
	PaginationResult,
} from "convex/server";
import { useEffect, useState } from "react";
import { vi } from "vitest";
import { describe, expect, it } from "vitest";
import { useNextPrevPaginatedQuery } from "../index";

type MockedQuery = FunctionReference<
	"query",
	"public",
	{ paginationOpts: PaginationOptions },
	PaginationResult<{ id: number; value: string }>
>;

const mockedQuery = "mockedQuery" as unknown as MockedQuery;

const mockedDocs = Array.from({ length: 10 }, (_, i) => ({
	id: i,
	value: `Item ${i}`,
}));

const mockUseQuery = (
	_query: MockedQuery,
	...[args]: OptionalRestArgsOrSkip<MockedQuery>
): MockedQuery["_returnType"] | undefined => {
	if (args === "skip") {
		return undefined;
	}

	const [result, setResult] = useState<MockedQuery["_returnType"]>();

	// biome-ignore lint/correctness/useExhaustiveDependencies:
	useEffect(() => {
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
	}, [JSON.stringify(args)]);

	return result;
};

vi.mock("convex/react");
vi.mocked(useQuery).mockImplementation(mockUseQuery as typeof useQuery);

describe("useNextPrevPaginatedQuery", () => {
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

		if (result.current._tag === "Loaded") {
			expect(result.current.results).toEqual(mockedDocs.slice(0, 3));
			expect(result.current.loadNext).toBeTruthy();
			expect(result.current.loadPrev).toBeNull();
		} else {
			expect.fail("Expected Loaded state");
		}
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
			if (result.current._tag === "Loaded") {
				result.current.loadNext?.();
			} else {
				expect.fail("Expected Loaded state");
			}
		});

		await waitFor(() => {
			expect(result.current._tag).toBe("Loaded");
		});

		if (result.current._tag === "Loaded") {
			expect(result.current.results).toEqual(mockedDocs.slice(3, 6));
			expect(result.current.loadNext).toBeTruthy();
			expect(result.current.loadPrev).toBeTruthy();
		} else {
			expect.fail("Expected Loaded state");
		}
	});

	it("should handle reaching the end of pagination", async () => {
		const { result } = renderHook(() =>
			useNextPrevPaginatedQuery(mockedQuery, {}, { initialNumItems: 8 }),
		);

		await waitFor(() => {
			expect(result.current._tag).toBe("Loaded");
		});

		await act(async () => {
			if (result.current._tag === "Loaded") {
				result.current.loadNext?.();
			} else {
				expect.fail("Expected Loaded state");
			}
		});

		expect(result.current._tag).toBe("LoadingNextResults");

		await waitFor(() => {
			expect(result.current._tag).toBe("Loaded");
		});

		if (result.current._tag === "Loaded") {
			expect(result.current.results).toEqual(mockedDocs.slice(8));
			expect(result.current.loadNext).toBeNull();
			expect(result.current.loadPrev).toBeTruthy();
		} else {
			expect.fail("Expected Loaded state");
		}
	});

	it("should handle skip argument", async () => {
		const { result } = renderHook(() =>
			useNextPrevPaginatedQuery(mockedQuery, "skip", { initialNumItems: 3 }),
		);

		expect(result.current._tag).toBe("Skipped");
	});
});
