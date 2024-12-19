import {
	type PaginatedQueryArgs,
	type PaginatedQueryReference,
	useQuery,
} from "convex/react";
import type {
	Cursor,
	FunctionReturnType,
	PaginationOptions,
} from "convex/server";
import { type Value, convexToJson } from "convex/values";
import { type Dispatch, useEffect, useReducer } from "react";

/**
 * Load data reactively from a paginated query, one page at a time.
 *
 * Use `loadNext` and `loadPrev` to navigate through pages.
 *
 * @param query A reference to the public paginated query function.
 * @param args The arguments object for the query function, excluding the `paginationOpts` property. That property is injected by this hook.
 * @param options An object specifying the `initialNumItems` to be loaded in the first page.
 * @returns The paginated query result, in the form of a discriminated union. Use the `_tag` property to determine the current state of the query.
 */
export const useNextPrevPaginatedQuery = <
	Query extends PaginatedQueryReference,
>(
	query: Query,
	args: PaginatedQueryArgs<Query> | "skip",
	options: { initialNumItems: number },
): Result<Query> => {
	if (options.initialNumItems <= 0)
		throw new Error("Initial number of items must be greater than zero");

	const initialState: State<Query> =
		args === "skip"
			? {
					_tag: "Skipped",
				}
			: {
					_tag: "LoadingInitialResults",
					args,
					initialNumItems: options.initialNumItems,
				};

	const [state, dispatch] = useReducer(reducer, initialState);

	const mergedArgs = mergeArgs(state);

	// NOTE: Is it possible to remove this `any`?
	const queryResults = useQuery(query, mergedArgs as any);

	// biome-ignore lint/correctness/useExhaustiveDependencies:
	useEffect(() => {
		if (queryResults) {
			dispatch({
				_tag: "GotResults",
				results: queryResults,
				nextCursor: queryResults.isDone ? null : queryResults.continueCursor,
			});
		}
	}, [
		queryResults
			? JSON.stringify(convexToJson(queryResults as unknown as Value))
			: null,
	]);

	const result: Result<Query> = makeResult(state, dispatch);

	return result;
};

export type Result<Query extends PaginatedQueryReference> =
	| { _tag: "Skipped" }
	| {
			_tag: "LoadingInitialResults";
	  }
	| {
			_tag: "Loaded";
			results: FunctionReturnType<Query>["page"];
			pageNum: number;
			loadNext: (() => void) | null;
			loadPrev: (() => void) | null;
	  }
	| {
			_tag: "LoadingNextResults";
	  }
	| {
			_tag: "LoadingPrevResults";
	  };

type State<Query extends PaginatedQueryReference> =
	| { _tag: "Skipped" }
	| {
			_tag: "LoadingInitialResults";
			args: PaginatedQueryArgs<Query>;
			initialNumItems: number;
	  }
	| {
			_tag: "LoadingNextResults";
			args: PaginatedQueryArgs<Query>;
			initialNumItems: number;
			loadingCursor: Cursor | null;
			prevCursors: Cursor[];
	  }
	| {
			_tag: "LoadingPrevResults";
			args: PaginatedQueryArgs<Query>;
			initialNumItems: number;
			loadingCursor: Cursor | null;
			prevCursors: Cursor[];
	  }
	| {
			_tag: "Loaded";
			args: PaginatedQueryArgs<Query>;
			initialNumItems: number;
			currentResults: FunctionReturnType<Query>;
			currentCursor: Cursor | null;
			prevCursors: Cursor[];
			nextCursor: Cursor | null;
	  };

type Action<Query extends PaginatedQueryReference> =
	| {
			_tag: "GotResults";
			results: FunctionReturnType<Query>;
			nextCursor: Cursor | null;
	  }
	| { _tag: "NextPageRequested" }
	| { _tag: "PrevPageRequested" };

const reducer = <Query extends PaginatedQueryReference>(
	state: State<Query>,
	action: Action<Query>,
): State<Query> => {
	switch (action._tag) {
		case "PrevPageRequested":
			if (state._tag === "Loaded") {
				const loadingCursor =
					state.prevCursors[state.prevCursors.length - 1] ?? null;
				const prevCursors = state.prevCursors.slice(0, -1);

				return {
					_tag: "LoadingPrevResults",
					args: state.args,
					initialNumItems: state.initialNumItems,
					loadingCursor,
					prevCursors,
				};
			} else {
				throw new Error(
					"Cannot load previous page unless the current page is loaded",
				);
			}
		case "NextPageRequested":
			if (state._tag === "Loaded") {
				return {
					_tag: "LoadingNextResults",
					args: state.args,
					initialNumItems: state.initialNumItems,
					loadingCursor: state.nextCursor,
					prevCursors: [
						...state.prevCursors,
						...(state.currentCursor ? [state.currentCursor] : []),
					],
				};
			} else {
				throw new Error(
					"Cannot load next page unless the current page is loaded",
				);
			}
		case "GotResults":
			if (state._tag === "LoadingInitialResults") {
				return {
					_tag: "Loaded",
					args: state.args,
					initialNumItems: state.initialNumItems,
					currentResults: action.results,
					currentCursor: null,
					prevCursors: [],
					nextCursor: action.nextCursor,
				};
			} else if (state._tag === "LoadingNextResults") {
				return {
					_tag: "Loaded",
					args: state.args,
					initialNumItems: state.initialNumItems,
					currentResults: action.results,
					currentCursor: state.loadingCursor,
					prevCursors: state.prevCursors,
					nextCursor: action.nextCursor,
				};
			} else if (state._tag === "LoadingPrevResults") {
				return {
					_tag: "Loaded",
					args: state.args,
					initialNumItems: state.initialNumItems,
					currentResults: action.results,
					currentCursor: state.loadingCursor,
					prevCursors: state.prevCursors,
					nextCursor: action.nextCursor,
				};
			} else if (state._tag === "Loaded") {
				return {
					...state,
					currentResults: action.results,
					currentCursor: state.currentCursor,
					prevCursors: state.prevCursors,
					nextCursor: action.nextCursor,
				};
			} else {
				throw new Error("Got results in impossible state");
			}
		default:
			throw new Error("Impossible action");
	}
};

const mergeArgs = <Query extends PaginatedQueryReference>(
	state: State<Query>,
): PaginatedQueryArgs<Query> | "skip" => {
	if (state._tag === "Skipped") {
		return "skip" as const;
	} else {
		switch (state._tag) {
			case "LoadingInitialResults":
				return {
					...state.args,
					paginationOpts: {
						numItems: state.initialNumItems,
						cursor: null,
					} satisfies PaginationOptions,
				};
			case "LoadingNextResults":
			case "LoadingPrevResults":
				return {
					...state.args,
					paginationOpts: {
						numItems: state.initialNumItems,
						cursor: state.loadingCursor,
					} satisfies PaginationOptions,
				};
			case "Loaded":
				return {
					...state.args,
					paginationOpts: {
						numItems: state.initialNumItems,
						cursor: state.currentCursor,
					} satisfies PaginationOptions,
				};
			default:
				throw new Error(`Invalid state: ${state}`);
		}
	}
};

const makeResult = <Query extends PaginatedQueryReference>(
	state: State<Query>,
	dispatch: Dispatch<Action<Query>>,
): Result<Query> => {
	switch (state._tag) {
		case "Skipped":
			return { _tag: "Skipped" };
		case "LoadingInitialResults":
			return {
				_tag: "LoadingInitialResults",
			};
		case "Loaded":
			return {
				_tag: "Loaded",
				results: state.currentResults.page,
				pageNum: 1 + state.prevCursors.length + (state.currentCursor ? 1 : 0),
				loadNext: makeLoadNext(state, dispatch),
				loadPrev: makeLoadPrev(state, dispatch),
			};
		case "LoadingNextResults":
			return {
				_tag: "LoadingNextResults",
			};
		case "LoadingPrevResults":
			return {
				_tag: "LoadingPrevResults",
			};
		default:
			throw new Error(`Invalid state: ${state}`);
	}
};

const makeLoadPrev = <Query extends PaginatedQueryReference>(
	state: State<Query>,
	dispatch: Dispatch<Action<Query>>,
): (() => void) | null => {
	if (
		state._tag === "Loaded" &&
		(state.prevCursors.length > 0 || state.currentCursor !== null)
	) {
		return () => dispatch({ _tag: "PrevPageRequested" });
	} else {
		return null;
	}
};

const makeLoadNext = <Query extends PaginatedQueryReference>(
	state: State<Query>,
	dispatch: Dispatch<Action<Query>>,
): (() => void) | null => {
	if (state._tag === "Loaded" && state.nextCursor !== null) {
		return () => dispatch({ _tag: "NextPageRequested" });
	} else {
		return null;
	}
};
