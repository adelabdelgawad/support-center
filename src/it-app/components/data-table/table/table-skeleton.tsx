import { Skeleton } from "@/components/ui/skeleton";
import { TableRow, TableCell } from "@/components/ui/table";

interface TableSkeletonProps {
  columns: number;
  rows?: number;
}

/**
 * Skeleton loader for data tables
 * Shows placeholder rows while data is loading
 */
export function TableSkeleton({ columns, rows = 5 }: TableSkeletonProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <TableRow key={rowIndex}>
          {Array.from({ length: columns }).map((_, colIndex) => (
            <TableCell key={colIndex} className="align-middle h-12">
              <div className="flex items-center justify-center h-full w-full">
                <Skeleton className="h-4 w-3/4" />
              </div>
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}
