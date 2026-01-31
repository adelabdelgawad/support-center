"use client";

import { useRouter } from 'next/navigation';
import { useEffect, useState, startTransition } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ChevronRight, ArrowLeft, Settings2, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge, DEFAULT_STATUS, type StatusInfo } from '@/components/ui/status-badge';
import { cn } from '@/lib/utils';

// Session storage key for preserving the last requests list URL
const REQUESTS_LIST_URL_KEY = 'requests-list-url';

interface TicketNavigationProps {
  status: StatusInfo;
  title: string;
  ticketNumber: number;
  onOpenMetadata?: () => void;
  onOpenUserInfo?: () => void;
}

/**
 * TicketNavigation - SSR-safe navigation component
 *
 * HYDRATION SAFETY:
 * - Uses isMounted flag to defer sessionStorage reads until after hydration
 * - Renders both mobile and desktop versions, uses CSS to control visibility
 * - No conditional rendering based on viewport state
 * - Prevents hydration mismatches
 */
export function TicketNavigation({
  status,
  title,
  ticketNumber,
  onOpenMetadata,
  onOpenUserInfo,
}: TicketNavigationProps) {
  const router = useRouter();

  // Get the saved requests list URL from session storage
  const [requestsListUrl, setRequestsListUrl] = useState('/support-center/requests');
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    // Mark as mounted first (prevents hydration mismatch)
    startTransition(() => {
      setIsMounted(true);

      // Read from session storage on mount
      const savedUrl = sessionStorage.getItem(REQUESTS_LIST_URL_KEY);
      if (savedUrl) {
        setRequestsListUrl(savedUrl);
      }
    });
  }, []);

  // Use default URL during SSR/hydration, saved URL after mount
  // This prevents href mismatch warnings
  const effectiveUrl = isMounted ? requestsListUrl : '/support-center/requests';

  // Handle back button click
  // If user came from within the app (has saved URL), use browser history
  // Otherwise (direct link), navigate to requests list
  const handleBackClick = () => {
    // Set flag so the requests list knows to refresh data
    sessionStorage.setItem('returning-from-details', 'true');

    // Check if user came from within the app
    const savedUrl = sessionStorage.getItem(REQUESTS_LIST_URL_KEY);
    const referrer = typeof document !== 'undefined' ? document.referrer : '';
    const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';

    // User came from within the app if:
    // 1. We have a saved URL in sessionStorage, OR
    // 2. The referrer is from the same origin (same domain)
    const cameFromApp = savedUrl || (referrer && referrer.startsWith(currentOrigin));

    if (cameFromApp) {
      router.back();
    } else {
      // Direct access - navigate to requests list
      router.push('/support-center/requests');
    }
  };

  // Handle breadcrumb click - navigate to saved list URL
  const handleBreadcrumbClick = (e: React.MouseEvent) => {
    e.preventDefault();
    // Set flag so the requests list knows to refresh data
    sessionStorage.setItem('returning-from-details', 'true');
    router.push(effectiveUrl);
  };

  return (
    <div className="border-b border-border bg-card shrink-0">
      <div className="flex items-center gap-2 py-2 px-2 md:px-4">
        {/* Back Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 min-w-[44px] md:h-8 md:w-8"
              onClick={handleBackClick}
            >
              <ArrowLeft className="h-5 w-5 md:h-4 md:w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Back to requests</TooltipContent>
        </Tooltip>

        {/* Breadcrumb - hidden on mobile, visible on md+ */}
        <div className="hidden md:flex items-center gap-1">
          <Link
            href={effectiveUrl}
            onClick={handleBreadcrumbClick}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Requests
          </Link>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>

        {/* Status Badge */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="cursor-default">
              <StatusBadge status={status} />
            </div>
          </TooltipTrigger>
          <TooltipContent>Current status: {status.name}</TooltipContent>
        </Tooltip>

        {/* Title */}
        <span className="text-foreground font-medium truncate flex-1 text-sm max-w-none md:max-w-[300px]">
          {title}
        </span>

        {/* Ticket Number - hidden on mobile, visible on md+ */}
        <Tooltip>
          <TooltipTrigger>
            <span className="hidden md:inline text-sm text-muted-foreground cursor-default">
              #{ticketNumber}
            </span>
          </TooltipTrigger>
          <TooltipContent>Ticket number</TooltipContent>
        </Tooltip>

        {/* Mobile: Quick action buttons - visible on mobile, hidden on md+ */}
        <div className="flex md:hidden items-center gap-1">
          {/* Open Metadata/Settings Sheet */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 min-w-[44px]"
                onClick={onOpenMetadata}
              >
                <Settings2 className="h-5 w-5 text-muted-foreground" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Ticket details</TooltipContent>
          </Tooltip>

          {/* Open User Info Sheet */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 min-w-[44px]"
                onClick={onOpenUserInfo}
              >
                <User className="h-5 w-5 text-muted-foreground" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Requester info</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
