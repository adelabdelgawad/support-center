'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { StatusBadge } from '@/components/ui/status-badge';
import type { RequestListItem as Ticket } from '@/types/requests-list';
import { useFormattedDate } from '@/lib/utils/hydration-safe-date';
import { cn } from '@/lib/utils';
import { useLongPress } from '@/hooks/use-long-press';

interface TicketCardProps {
  ticket: Ticket;
  isSelected?: boolean;
  showCheckbox?: boolean; // NEW: Control checkbox visibility
  onSelect?: (ticketId: string, selected: boolean) => void;
  onLongPress?: (ticketId: string) => void; // NEW: Long press handler
}

/**
 * Mobile-optimized compact card component for displaying a ticket
 * Used on mobile and tablet devices (< 1024px) instead of table rows
 *
 * Layout:
 * - Row 1: Subject (single line, truncated) with chevron indicator
 * - Row 2: Status badge • Priority dot/label • Requester • Timestamp • Unread dot
 *
 * Features:
 * - Compact 2-line layout (WhatsApp/messaging app style)
 * - Full card is tappable to navigate to details
 * - Long press to enter selection mode (mobile only)
 * - Checkbox for selection (shown in selection mode or on tablet)
 * - Minimum 52px tap target height
 * - All critical info visible in minimal vertical space
 * - No card shadows - flat list style
 */
export function TicketCard({
  ticket,
  isSelected = false,
  showCheckbox = true,
  onSelect,
  onLongPress,
}: TicketCardProps) {
  const router = useRouter();
  const isLongPressing = useRef(false);

  // Hydration-safe date formatting
  const requestedTime = useFormattedDate(ticket.requested);

  const handleCheckboxChange = (checked: boolean) => {
    onSelect?.(ticket.id, checked);
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    // Prevent card navigation when clicking checkbox
    e.preventDefault();
    e.stopPropagation();
  };

  // Long press handlers
  const longPressHandlers = useLongPress({
    onLongPress: () => {
      isLongPressing.current = true;
      onLongPress?.(ticket.id);
      // Provide haptic feedback if available
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
    },
    delay: 500,
  });

  const handleCardClick = (e: React.MouseEvent) => {
    // If we just long-pressed, don't navigate
    if (isLongPressing.current) {
      e.preventDefault();
      isLongPressing.current = false;
      return;
    }

    // If in selection mode (checkbox visible), toggle selection instead of navigating
    if (showCheckbox && onSelect) {
      e.preventDefault();
      onSelect(ticket.id, !isSelected);
    } else {
      // Navigate to details
      router.push(`/support-center/requests/${ticket.id}`);
    }
  };

  return (
    <div
      {...longPressHandlers}
      onClick={handleCardClick}
      className={cn(
        'block border-b border-border py-2.5 px-3 active:bg-accent/50 transition-colors cursor-pointer min-h-[52px]',
        isSelected && 'bg-accent/30',
        ticket.technicianHasUnread && !isSelected && 'bg-orange-50 dark:bg-orange-950/30'
      )}
    >
      <div className="flex gap-2">
        {/* Checkbox - only show when in selection mode */}
        {showCheckbox && (
          <div
            className="flex-shrink-0 min-w-[40px] min-h-[44px] flex items-center justify-center"
            onClick={handleCheckboxClick}
          >
            <Checkbox
              checked={isSelected}
              onCheckedChange={handleCheckboxChange}
              className="h-5 w-5"
            />
          </div>
        )}

        {/* Content - Compact 2-row layout */}
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          {/* Row 1: Subject (single line) */}
          <div className="flex items-center gap-2">
            {ticket.parentTaskId && (
              <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            )}
            <h3 className="text-sm font-medium text-foreground truncate flex-1">
              {ticket.subject}
            </h3>
          </div>

          {/* Row 2: Metadata (single compact line) */}
          <div className="flex items-center gap-1.5 text-xs">
            {/* Status badge - extra compact */}
            <StatusBadge
              status={ticket.status}
              className="text-[10px] px-1.5 py-0 h-4 leading-none font-medium"
            />

            {/* Priority dot */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <div className={cn(
                'w-1.5 h-1.5 rounded-full',
                getPriorityDotColor(ticket.priority.name)
              )} />
              <span className={cn(
                'text-[10px] font-medium uppercase tracking-wide',
                getPriorityColor(ticket.priority.name)
              )}>
                {getPriorityShort(ticket.priority.name)}
              </span>
            </div>

            {/* Divider */}
            <span className="text-muted-foreground/40">•</span>

            {/* Requester - truncated */}
            <span className="text-muted-foreground truncate max-w-[80px]">
              {ticket.requester.fullName || 'Unknown'}
            </span>

            {/* Divider */}
            <span className="text-muted-foreground/40">•</span>

            {/* Timestamp */}
            <span className="text-muted-foreground flex-shrink-0 text-[10px]">
              {requestedTime}
            </span>

            {/* Unread indicator - compact dot */}
            {ticket.technicianHasUnread && (
              <div className="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0 ml-auto"
                   title="Unread messages" />
            )}
          </div>
        </div>

        {/* Chevron indicator - only show when not in selection mode */}
        {!showCheckbox && (
          <div className="flex-shrink-0 flex items-center text-muted-foreground/60">
            <ChevronRight className="h-4 w-4" />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Get priority text color based on priority name
 */
function getPriorityColor(priorityName: string): string {
  const lower = priorityName.toLowerCase();
  if (lower.includes('critical') || lower.includes('urgent')) return 'text-red-600 dark:text-red-400';
  if (lower.includes('high')) return 'text-orange-600 dark:text-orange-400';
  if (lower.includes('medium') || lower.includes('normal')) return 'text-yellow-600 dark:text-yellow-500';
  return 'text-muted-foreground';
}

/**
 * Get priority dot background color based on priority name
 */
function getPriorityDotColor(priorityName: string): string {
  const lower = priorityName.toLowerCase();
  if (lower.includes('critical') || lower.includes('urgent')) return 'bg-red-500';
  if (lower.includes('high')) return 'bg-orange-500';
  if (lower.includes('medium') || lower.includes('normal')) return 'bg-yellow-500';
  return 'bg-gray-400';
}

/**
 * Get abbreviated priority label for compact display
 */
function getPriorityShort(priorityName: string): string {
  const lower = priorityName.toLowerCase();
  if (lower.includes('critical')) return 'Crit';
  if (lower.includes('urgent')) return 'Urg';
  if (lower.includes('high')) return 'High';
  if (lower.includes('medium')) return 'Med';
  if (lower.includes('normal')) return 'Norm';
  if (lower.includes('low')) return 'Low';
  return priorityName.substring(0, 4);
}
