# `useNextPrevPaginatedQuery`

A React hook for paginating through a Convex paginated query result one page at a time. Works with the same query functions as Convex's [`usePaginatedQuery`](https://docs.convex.dev/api/modules/react#usepaginatedquery) hook.

This hook keeps track of previous cursors in order to allow navigating forward and backwards through pages. It doesn't (yet) account for split pages.

## Installation

```bash
npm install convex-use-next-prev-paginated-query
```

```bash
pnpm add convex-use-next-prev-paginated-query
```

```bash
yarn add convex-use-next-prev-paginated-query
```

## Usage

Use this hook with a public query that accepts a `paginationOpts` argument of type `PaginationOptions` and returns a `PaginationResult`, just like how the default [`usePaginatedQuery`](https://docs.convex.dev/api/modules/react#usepaginatedquery) works. See the [this page](https://docs.convex.dev/database/pagination#writing-paginated-query-functions) of the Convex docs for more information on how to write a well-formed paginated query function. It might look something like this:

```ts
import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";

export const list = query({
  args: { paginationOpts: paginationOptsValidator, channel: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("messages")
      .withIndex("by_channel", (q) => q.eq("channel", args.channel))
      .order("desc")
      .paginate(args.paginationOpts),
});
```

Once you've defined your paginated query function, you can use it with this hook like so:

```tsx
import { useNextPrevPaginatedQuery } from "convex-use-next-prev-paginated-query";
import { api } from "./_generated/api";

const MyComponent = () => {
  const result = useNextPrevPaginatedQuery(
    api.list,
    { channel: "general" },
    { initialNumItems: 10 }
  );

  switch (result._tag) {
    case "Skipped":
      return <div>Skipped</div>;
    case "LoadingInitialResults":
      return <div>LoadingInitialResults</div>;
    case "Loaded":
      return (
        <div>
          <div>
            {result.page.map((message) => (
              <div key={message._id}>{message.text}</div>
            ))}
          </div>
          {result.loadNext && <button onClick={result.loadNext}>Next</button>}
          Page {result.pageNum}
          {result.loadPrev && <button onClick={result.loadPrev}>Prev</button>}
        </div>
      );
    case "LoadingNextResults":
      return <div>LoadingNextResults</div>;
    case "LoadingPrevResults":
      return <div>LoadingPrevResults</div>;
    default:
      throw "Unknown state";
  }
};
```
