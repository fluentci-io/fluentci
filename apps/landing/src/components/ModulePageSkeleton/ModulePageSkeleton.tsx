import { Skeleton } from "../Skeleton";

export function ModulePageSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading module"
      className="module-page-grid mt-10"
    >
      <span className="sr-only">Loading module…</span>
      <div className="min-w-0">
        <div className="flex items-center gap-5">
          <Skeleton className="size-16 shrink-0 rounded-xl sm:size-20" />
          <div className="flex-1 space-y-3">
            <Skeleton className="block h-3 w-28" />
            <Skeleton className="block h-8 w-3/4" />
          </div>
        </div>
        <div className="mt-7 space-y-3">
          <Skeleton className="block h-4 w-full" />
          <Skeleton className="block h-4 w-4/5" />
        </div>
        <div className="mt-5 flex gap-2">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-6 w-16" />
          ))}
        </div>
        <div className="mt-7 flex items-center gap-3 border-y border-line py-5">
          <Skeleton className="size-5 rounded-full" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="ml-4 h-3 w-16" />
        </div>
        <div className="mt-10 space-y-3">
          <Skeleton className="mb-6 block h-4 w-24" />
          {[0, 1, 2, 3].map((index) => (
            <Skeleton
              key={index}
              className={`block h-3 ${index === 3 ? "w-2/3" : "w-full"}`}
            />
          ))}
        </div>
      </div>
      <div className="min-w-0">
        <Skeleton className="block h-5 w-36" />
        <Skeleton className="mt-5 block h-3 w-3/4" />
        <Skeleton className="mt-4 block h-20 w-full rounded-lg" />
        <div className="mt-7 space-y-5">
          {[0, 1, 2].map((index) => (
            <div className="flex justify-between gap-4" key={index}>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
