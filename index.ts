import {
	type PaginatedQueryArgs,
	type PaginatedQueryReference,
	useQuery,
} from "convex/react";
import {
	type Cursor,
	type FunctionReturnType,
	type PaginationOptions,
	getFunctionName,
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

	const queryName = getFunctionName(query);

	const [state, dispatch] = useReducer(
		reducer,
		{ queryName, args, options },
		initialState,
	);

	useEffect(() => {
		if (
			(state._tag !== "Skipped" &&
				(JSON.stringify(state.args) !== JSON.stringify(args) ||
					state.initialNumItems !== options.initialNumItems ||
					state.queryName !== queryName)) ||
			(state._tag === "Skipped" && args !== "skip")
		) {
			dispatch({
				_tag: "ArgsChanged",
				queryName,
				args,
				options,
			});
		}
	}, [args, options, state, queryName]);

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

/**
 * The result of a paginated query, modeled as a discriminated union.
 *
 * You should use `if` or `switch` statements to conditionally render
 * based on the `_tag` property, which indicates the current state of the
 * paginated query.
 */
export type Result<Query extends PaginatedQueryReference> =
	| { _tag: "Skipped" }
	| {
			_tag: "LoadingInitialResults";
	  }
	| {
			_tag: "Loaded";
			/** @deprecated Use `page` instead. This will be removed in the next major release. */
			results: FunctionReturnType<Query>["page"];
			/** The current page of results. */
			page: FunctionReturnType<Query>["page"];
			/** The number of the current page (1-indexed). */
			pageNum: number;
			/** A function which loads the next page of results, or null if this is the last page. */
			loadNext: (() => void) | null;
			/** A function which loads the previous page of results, or null if this is the first page. */
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
			queryName: string;
			args: PaginatedQueryArgs<Query>;
			initialNumItems: number;
	  }
	| {
			_tag: "LoadingNextResults";
			queryName: string;
			args: PaginatedQueryArgs<Query>;
			initialNumItems: number;
			loadingCursor: Cursor | null;
			prevCursors: Cursor[];
	  }
	| {
			_tag: "LoadingPrevResults";
			queryName: string;
			args: PaginatedQueryArgs<Query>;
			initialNumItems: number;
			loadingCursor: Cursor | null;
			prevCursors: Cursor[];
	  }
	| {
			_tag: "Loaded";
			queryName: string;
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
	| { _tag: "PrevPageRequested" }
	| {
			_tag: "ArgsChanged";
			queryName: string;
			args: PaginatedQueryArgs<Query> | "skip";
			options: { initialNumItems: number };
	  };

const reducer = <Query extends PaginatedQueryReference>(
	state: State<Query>,
	action: Action<Query>,
): State<Query> => {
	switch (action._tag) {
		case "ArgsChanged":
			return initialState({
				queryName: action.queryName,
				args: action.args,
				options: action.options,
			});
		case "PrevPageRequested":
			if (state._tag === "Loaded") {
				const loadingCursor =
					state.prevCursors[state.prevCursors.length - 1] ?? null;
				const prevCursors = state.prevCursors.slice(0, -1);

				return {
					_tag: "LoadingPrevResults",
					queryName: state.queryName,
					args: state.args,
					initialNumItems: state.initialNumItems,
					loadingCursor,
					prevCursors,
				};
			}
			throw new Error(
				"Cannot load previous page unless the current page is loaded",
			);
		case "NextPageRequested":
			if (state._tag === "Loaded") {
				return {
					_tag: "LoadingNextResults",
					queryName: state.queryName,
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
					queryName: state.queryName,
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
					queryName: state.queryName,
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
					queryName: state.queryName,
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
				page: state.currentResults.page,
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

const initialState = <Query extends PaginatedQueryReference>({
	queryName,
	args,
	options,
}: {
	queryName: string;
	args: PaginatedQueryArgs<Query> | "skip";
	options: { initialNumItems: number };
}): State<Query> =>
	args === "skip"
		? { _tag: "Skipped" }
		: {
				_tag: "LoadingInitialResults" as const,
				queryName,
				args,
				initialNumItems: options.initialNumItems,
			};
