import { Skeleton } from "../Skeleton";

export function CacheChartSkeleton() {
  return (
    <div role="status" aria-label="Loading usage history" className="mt-3">
      <div
        className="flex h-[185px] items-end gap-1 pb-4 pt-6 sm:gap-2"
        aria-hidden="true"
      >
        {Array.from({ length: 30 }, (_, index) => 35 + ((index * 17) % 60)).map(
          (height, index) => (
            <div key={index} className="flex h-full min-w-0 flex-1 items-end">
              <div style={{ height: `${height}%` }} className="w-full">
                <Skeleton className="h-full w-full" />
              </div>
            </div>
          ),
        )}
      </div>
      <Skeleton className="mt-2 block h-3 w-3/4" />
    </div>
  );
}

export function CacheTableSkeleton({
  columns,
  label,
}: {
  columns: number;
  label: string;
}) {
  return (
    <tr>
      <td colSpan={columns} className="px-4 py-5">
        <div role="status" aria-label={label} className="space-y-6">
          {["w-3/4", "w-1/2", "w-2/3"].map((width) => (
            <div
              key={width}
              className="flex items-center gap-4"
              aria-hidden="true"
            >
              <div className="min-w-0 flex-1">
                <Skeleton className={`h-3 ${width}`} />
              </div>
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-6 w-12 rounded-lg" />
            </div>
          ))}
        </div>
      </td>
    </tr>
  );
}

export function CachePageSkeleton() {
  return (
    <div role="status" aria-label="Loading your account" className="mt-8">
      <div
        className="grid items-start gap-8 md:grid-cols-[15rem_minmax(0,1fr)]"
        aria-hidden="true"
      >
        <div className="grid grid-cols-2 gap-4 p-3 md:grid-cols-1">
          {[0, 1, 2, 3, 4].map((item) => (
            <Skeleton key={item} className="h-5 w-3/4" />
          ))}
        </div>
        <div className="min-w-0 rounded-xl bg-panel p-6 sm:p-8">
          <Skeleton className="block h-6 w-40" />
          <Skeleton className="mt-5 block h-3 w-3/4" />
          <Skeleton className="mt-5 block h-4 w-32" />
          <div className="mt-8">
            <CacheChartSkeleton />
          </div>
          <Skeleton className="mt-6 block h-10 w-full rounded-lg" />
          <Skeleton className="mt-5 block h-36 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
