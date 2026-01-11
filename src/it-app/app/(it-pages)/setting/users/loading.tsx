import { Skeleton } from '@/components/ui/skeleton';

export default function UsersLoading() {
  return (
    <div className="relative h-full bg-background min-h-0">
      {/* Desktop View (md and up) */}
      <div className="hidden md:flex h-full p-1">
        {/* Status Panel Skeleton */}
        <div className="w-64 shrink-0 bg-card rounded-md border p-4 space-y-4">
          <Skeleton className="h-5 w-24" />
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-5 w-16 mt-4" />
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>

        {/* Main Content Skeleton */}
        <div className="flex-1 h-full flex flex-col min-h-0 min-w-0 ml-2 space-y-2">
          {/* Table Header */}
          <div className="bg-card border rounded-md p-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-9 w-64" />
              <div className="flex gap-2">
                <Skeleton className="h-9 w-9" />
                <Skeleton className="h-9 w-24" />
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 min-h-0 bg-card border rounded-md">
            <div className="border-b p-3">
              <div className="flex gap-4">
                <Skeleton className="h-4 w-8" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
            <div className="overflow-auto">
              {Array.from({ length: 10 }).map((_, index) => (
                <div key={index} className="flex items-center gap-4 p-3 border-b">
                  <Skeleton className="h-4 w-8" />
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-32 mb-1" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-10 rounded-full" />
                  <Skeleton className="h-8 w-8" />
                </div>
              ))}
            </div>
          </div>

          {/* Pagination */}
          <div className="shrink-0 bg-card border rounded-md p-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-40" />
              <div className="flex gap-2">
                <Skeleton className="h-8 w-8" />
                <Skeleton className="h-8 w-20" />
                <Skeleton className="h-8 w-8" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile View (below md) */}
      <div className="md:hidden h-full flex flex-col">
        {/* Header */}
        <div className="bg-background border-b p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-9 w-9" />
          </div>
          <Skeleton className="h-10 w-full" />
          <div className="flex gap-2 overflow-x-auto">
            <Skeleton className="h-8 w-20 shrink-0" />
            <Skeleton className="h-8 w-24 shrink-0" />
            <Skeleton className="h-8 w-20 shrink-0" />
          </div>
        </div>

        {/* Cards */}
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="bg-card rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-32 mb-1" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-5 w-10 rounded-full" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
