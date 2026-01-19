import { Skeleton } from '@/components/ui/skeleton';

/**
 * Request Details Loading Skeleton
 *
 * Displayed during navigation to the request details/chat page.
 * Matches the layout of ticket-detail-client.tsx with:
 * - Navigation header with back button, status, title
 * - Left sidebar with ticket metadata (desktop)
 * - Center chat area with message bubbles
 * - Right sidebar with user info and notes (desktop)
 * - Message input area at bottom
 */
export default function RequestDetailsLoading() {
  return (
    <div className="absolute inset-0 flex flex-col bg-background" suppressHydrationWarning>
      {/* Top Navigation Bar */}
      <div className="border-b border-border bg-card shrink-0">
        {/* Mobile Navigation */}
        <div className="md:hidden flex items-center gap-2 py-2 px-2">
          {/* Back Button */}
          <Skeleton className="h-10 w-10 rounded-md" />
          {/* Status Badge */}
          <Skeleton className="h-6 w-20 rounded-full" />
          {/* Title */}
          <Skeleton className="h-4 flex-1" />
          {/* Mobile Action Buttons */}
          <Skeleton className="h-10 w-10 rounded-md" />
          <Skeleton className="h-10 w-10 rounded-md" />
        </div>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-2 py-2 px-4">
          {/* Back Button */}
          <Skeleton className="h-8 w-8 rounded-md" />
          {/* Breadcrumb */}
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-4" />
          {/* Status Badge */}
          <Skeleton className="h-6 w-24 rounded-full" />
          {/* Title */}
          <Skeleton className="h-4 w-48" />
          {/* Ticket Number */}
          <div className="ml-auto">
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Ticket Metadata (Desktop Only) */}
        <div className="hidden md:block w-80 border-r border-border bg-card shrink-0">
          <div className="p-4 space-y-4">
            {/* Status Section */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>

            <Skeleton className="h-px w-full" />

            {/* Assignees Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-12" />
              </div>
              <Skeleton className="h-10 w-full rounded-md" />
            </div>

            <Skeleton className="h-px w-full" />

            {/* Priority Section */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-14" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>

            <Skeleton className="h-px w-full" />

            {/* Category Section */}
            <div className="space-y-3">
              <div className="space-y-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            </div>

            <Skeleton className="h-px w-full" />

            {/* Note Section */}
            <div className="space-y-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-20 w-full rounded-md" />
              <Skeleton className="h-3 w-24" />
            </div>

            {/* Add Note Button */}
            <Skeleton className="h-9 w-full rounded-md" />
          </div>
        </div>

        {/* Center - Chat Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Action Bar */}
          <div className="px-3 sm:px-4 pt-2 pb-1 flex items-center gap-2">
            <Skeleton className="h-8 w-32 rounded-md" />
            <div className="ml-auto">
              <Skeleton className="h-6 w-16 rounded-md" />
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-auto p-4 space-y-4">
            {/* Left Message (from requester) */}
            <div className="flex gap-3 max-w-[85%]">
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-24 w-64 rounded-lg rounded-tl-none" />
              </div>
            </div>

            {/* Right Message (from technician) */}
            <div className="flex gap-3 max-w-[85%] ml-auto flex-row-reverse">
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <div className="space-y-1">
                <div className="flex items-center gap-2 justify-end">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-16 w-56 rounded-lg rounded-tr-none" />
              </div>
            </div>

            {/* Left Message */}
            <div className="flex gap-3 max-w-[85%]">
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-14" />
                </div>
                <Skeleton className="h-32 w-72 rounded-lg rounded-tl-none" />
              </div>
            </div>

            {/* Screenshot Message */}
            <div className="flex gap-3 max-w-[85%]">
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-48 w-64 rounded-lg rounded-tl-none" />
              </div>
            </div>

            {/* Right Message */}
            <div className="flex gap-3 max-w-[85%] ml-auto flex-row-reverse">
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <div className="space-y-1">
                <div className="flex items-center gap-2 justify-end">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-20 w-48 rounded-lg rounded-tr-none" />
              </div>
            </div>
          </div>

          {/* Reply Input Area */}
          <div className="border-t px-3 sm:px-4 py-3">
            <div className="flex items-end gap-2">
              {/* Recipient Info */}
              <div className="hidden sm:flex items-center gap-2 pb-2">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-4 w-16" />
              </div>

              {/* Input Area */}
              <div className="flex-1 flex items-end gap-2">
                <Skeleton className="h-10 flex-1 rounded-md" />
                <Skeleton className="h-10 w-10 rounded-md" />
                <Skeleton className="h-10 w-10 rounded-md" />
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar - User Info (Desktop Only) */}
        <div className="hidden md:block w-80 border-l border-border bg-card shrink-0">
          <div className="p-3 space-y-3">
            {/* User Profile Header */}
            <div className="mt-6 mb-3">
              <div className="flex items-start gap-3 mb-2">
                <Skeleton className="h-12 w-12 rounded-full shrink-0" />
                <div className="flex-1 min-w-0 space-y-1">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-40" />
                </div>
              </div>
            </div>

            <Skeleton className="h-px w-full" />

            {/* Contact Details */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 py-1">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-4 w-40" />
              </div>
              <div className="flex items-center gap-2 py-1">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-4 w-28" />
              </div>
              <div className="flex items-center gap-2 py-1">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-4 w-32" />
              </div>
              <div className="flex items-center gap-2 py-1">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-4 w-36" />
              </div>
            </div>

            <Skeleton className="h-px w-full" />

            {/* Sub-Tasks Section */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-6 rounded-full" />
              </div>
              <Skeleton className="h-16 w-full rounded-md" />
            </div>

            <Skeleton className="h-px w-full" />

            {/* Notes Section */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-5 w-6 rounded-full" />
              </div>

              {/* Note Cards */}
              <div className="space-y-2">
                <div className="border rounded-md p-2.5 space-y-2">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                  <div className="flex items-center justify-between pt-2 border-t">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
                <div className="border rounded-md p-2.5 space-y-2">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-3/4" />
                  <div className="flex items-center justify-between pt-2 border-t">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
