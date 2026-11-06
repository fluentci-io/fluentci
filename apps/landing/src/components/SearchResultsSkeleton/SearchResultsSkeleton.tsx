import { Skeleton } from "../Skeleton";

export function SearchResultsSkeleton() {
  return (
    <div role="status" aria-label="Searching the registry" className="p-1">
      <span className="sr-only">Searching the registry…</span>
      {[0, 1, 2, 3].map((index) => (
        <div className="flex items-center gap-3 rounded-lg p-3" key={index}>
          <Skeleton className="size-[72px] shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2.5">
            <Skeleton className="block h-4 w-3/4" />
            <Skeleton className="block h-3 w-full" />
            <div className="flex items-center gap-2">
              <Skeleton className="size-5 rounded-full" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton className="h-3 w-8 shrink-0" />
        </div>
      ))}
    </div>
  );
}
