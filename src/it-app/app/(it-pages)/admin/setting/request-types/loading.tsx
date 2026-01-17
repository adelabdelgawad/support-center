import { Skeleton } from '@/components/ui/skeleton';

export default function RequestTypesLoading() {
  return (
    <div className="relative h-full bg-muted min-h-0">
      {/* Desktop View (md and up) */}
      <div className="hidden md:flex h-full p-1">
        <div className="h-full flex-1 flex flex-col min-h-0 min-w-0 space-y-2">
          <div className="flex-1 min-h-0 flex flex-col bg-background rounded-md border">
            {/* Header Skeleton */}
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-4">
                <Skeleton className="h-6 w-32" />
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-20" />
                </div>
              </div>
              <Skeleton className="h-9 w-36" />
            </div>

            {/* Table Header Skeleton */}
            <div className="border-b">
              <div className="flex items-center px-4 py-3 gap-4">
                <Skeleton className="h-4 w-[200px]" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-[100px]" />
                <Skeleton className="h-4 w-[100px]" />
              </div>
            </div>

            {/* Table Rows Skeleton */}
            <div className="flex-1 overflow-auto">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="flex items-center px-4 py-4 gap-4 border-b">
                  <Skeleton className="h-4 w-[180px]" />
                  <Skeleton className="h-4 flex-1 max-w-[300px]" />
                  <div className="w-[100px] flex justify-center">
                    <Skeleton className="h-5 w-10 rounded-full" />
                  </div>
                  <div className="w-[100px] flex justify-center gap-2">
                    <Skeleton className="h-8 w-8 rounded" />
                    <Skeleton className="h-8 w-8 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile View (below md) */}
      <div className="md:hidden h-full flex flex-col">
        {/* Header Skeleton */}
        <div className="bg-background border-b p-4">
          <div className="flex items-center justify-between mb-3">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-9 w-20" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-20" />
          </div>
        </div>

        {/* Cards Skeleton */}
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="bg-background rounded-lg border p-4">
              <div className="flex items-start justify-between mb-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-5 w-10 rounded-full" />
              </div>
              <Skeleton className="h-4 w-full mb-3" />
              <div className="flex gap-2">
                <Skeleton className="h-9 flex-1" />
                <Skeleton className="h-9 w-12" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
