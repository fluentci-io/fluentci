import { Skeleton } from "../Skeleton";
export function ModuleGridSkeleton() {
  return (
    <div className="catalog-grid" role="status" aria-label="Loading modules">
      {Array.from({ length: 9 }, (_, index) => (
        <div key={index} className="catalog-card" aria-hidden="true">
          <div className="flex items-center gap-3">
            <Skeleton className="size-14 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3 w-12" />
            </div>
          </div>
          <div className="mt-5 space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
          <div className="mt-4 flex gap-2">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-12" />
          </div>
          <div className="mt-auto flex items-center gap-2 border-t border-line pt-4">
            <Skeleton className="size-6 rounded-full" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}
