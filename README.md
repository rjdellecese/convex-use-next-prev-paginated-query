# `useNextPrevPaginatedQuery`

A React hook for interacting with a paginated Convex query result using next and previous buttons.

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

```tsx
import { useNextPrevPaginatedQuery } from "convex-use-next-prev-paginated-query";

const MyComponent = () => {
  const result = useNextPrevPaginatedQuery(mockedQuery, {}, { initialNumItems: 10 });

  if (result._tag === "Skipped") {
    return <div>Skipped</div>;
  } else if (result._tag === "LoadingInitialResults") {
    return <div>LoadingInitialResults</div>;
  } else if (result._tag === "Loaded") {
    return (
      <div>
        {JSON.stringify(result.results)}
        {result.loadNext && <button onClick={result.loadNext}>Next</button>}
        Page #{result.pageNum}
        {result.loadPrev && <button onClick={result.loadPrev}>Prev</button>}
      </div>
    );
  } else if (result._tag === "LoadingNextResults") {
    return <div>LoadingNextResults</div>;
  } else if (result._tag === "LoadingPrevResults") {
    return <div>LoadingPrevResults</div>;
  } else {
    throw "Unknown state";
  }
};
```
