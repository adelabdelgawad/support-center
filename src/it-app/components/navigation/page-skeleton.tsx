'use client';

/**
 * Page Skeleton
 *
 * A generic page skeleton that provides immediate visual feedback
 * during navigation transitions. Matches common page layouts.
 */

import React from 'react';
import { Skeleton } from '@/components/ui/skeleton';

interface PageSkeletonProps {
  /**
   * Show the header section skeleton
   * @default true
   */
  showHeader?: boolean;

  /**
   * Show the filter/toolbar section skeleton
   * @default true
   */
  showToolbar?: boolean;

  /**
   * Number of content rows to show
   * @default 8
   */
  rows?: number;

  /**
   * Layout variant
   * @default 'table'
   */
  variant?: 'table' | 'cards' | 'details';
}

export function PageSkeleton({
  showHeader = true,
  showToolbar = true,
  rows = 8,
  variant = 'table',
}: PageSkeletonProps) {
  return (
    <div className="flex flex-col gap-6 p-6 animate-in fade-in duration-200">
      {/* Header Section */}
      {showHeader && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
      )}

      {/* Toolbar/Filter Section */}
      {showToolbar && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-10 w-32" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>
      )}

      {/* Content Section */}
      {variant === 'table' && <TableSkeleton rows={rows} />}
      {variant === 'cards' && <CardsSkeleton count={rows} />}
      {variant === 'details' && <DetailsSkeleton />}
    </div>
  );
}

function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div className="rounded-lg border">
      {/* Table Header */}
      <div className="flex items-center gap-4 border-b bg-muted/50 px-4 py-3">
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-48 hidden sm:block" />
        <Skeleton className="h-4 w-24 hidden md:block" />
        <Skeleton className="h-4 w-24 hidden lg:block" />
        <Skeleton className="h-4 w-20 ml-auto" />
      </div>

      {/* Table Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b last:border-0 px-4 py-3"
        >
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-48 hidden sm:block" />
          <Skeleton className="h-4 w-24 hidden md:block" />
          <Skeleton className="h-4 w-24 hidden lg:block" />
          <Skeleton className="h-8 w-8 ml-auto rounded" />
        </div>
      ))}

      {/* Pagination */}
      <div className="flex items-center justify-between border-t px-4 py-3">
        <Skeleton className="h-4 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-8" />
        </div>
      </div>
    </div>
  );
}

function CardsSkeleton({ count }: { count: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border p-4 space-y-3">
          <div className="flex items-start justify-between">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <div className="flex items-center gap-2 pt-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}

function DetailsSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Main Content */}
      <div className="lg:col-span-2 space-y-6">
        <div className="rounded-lg border p-6 space-y-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
        <div className="rounded-lg border p-6 space-y-4">
          <Skeleton className="h-6 w-32" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-4">
              <Skeleton className="h-10 w-10 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-16 w-full rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sidebar */}
      <div className="space-y-6">
        <div className="rounded-lg border p-6 space-y-4">
          <Skeleton className="h-6 w-24" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border p-6 space-y-4">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </div>
  );
}

/**
 * Compact skeleton for smaller content areas
 */
export function CompactSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 flex-1" />
        </div>
      ))}
    </div>
  );
}
