'use client';

import { useState } from 'react';
import { ArrowDown } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import type { RequestListItem as Ticket } from '@/types/requests-list';
import { TicketsTableRow } from './tickets-table-row';
import { TicketCard } from './ticket-card';
import { useViewport } from '@/hooks/use-mobile';

/**
 * Responsive Tickets Table/Card Component
 *
 * RESPONSIVE STRATEGY:
 * ====================
 * - Mobile & Tablet (< 1024px): Card-based layout for touch-friendly interaction
 * - Desktop (>= 1024px): Full table layout with all columns visible
 *
 * LAYOUT STRATEGY:
 * ================
 * - Parent component provides height constraint (via CSS Grid 1fr row)
 * - This component fills parent height with flex-1 min-h-0
 * - overflow-auto enables both vertical and horizontal scrolling when content exceeds dimensions
 * - Header/table header uses sticky positioning to stay visible during vertical scroll
 * - Fluent scrollbar styling for consistent UX
 *
 * Card Layout (Mobile/Tablet):
 * - Touch-optimized cards with 44px minimum touch targets
 * - Shows key info: status, subject, requester, priority, last message
 * - Select all checkbox and unread filter in sticky header
 * - Full card is tappable to navigate to ticket details
 *
 * Table Layout (Desktop):
 * - Full data table with all columns visible
 * - Sticky header row during vertical scroll
 * - Horizontal scroll enabled when columns exceed viewport width
 * - All columns have min-width (~1,660px total) ensuring horizontal scroll on most screens
 *
 * To modify:
 * - Adjust breakpoint logic in useViewport hook (hooks/use-mobile.ts)
 * - Adjust parent grid-rows in tickets-page-client.tsx
 * - Adjust column min-width values to change when horizontal scroll appears
 */

interface TicketsTableProps {
  tickets: Ticket[];
  selectedTickets: Set<string>;
  showUnreadOnly?: boolean;
  selectionMode?: boolean; // NEW: Controlled selection mode from parent
  onTicketClick?: (ticketId: string) => void;
  onSelectAll?: (checked: boolean) => void;
  onSelectTicket?: (ticketId: string, selected: boolean) => void;
  onUnreadFilterChange?: (showUnread: boolean) => void;
  onSelectionModeChange?: (enabled: boolean) => void; // NEW: Notify parent of mode change
}

// Common header cell styles
const thBaseClass = "text-foreground h-12 px-2 text-left align-middle font-medium whitespace-nowrap bg-muted/50";
const thTextClass = "text-xs font-semibold text-muted-foreground";

export function TicketsTable({
  tickets,
  selectedTickets,
  showUnreadOnly = false,
  selectionMode = false,
  onTicketClick,
  onSelectAll,
  onSelectTicket,
  onUnreadFilterChange,
  onSelectionModeChange,
}: TicketsTableProps) {
  const { isMobile, isTablet, isDesktop } = useViewport();
  const selectAll = selectedTickets.size === tickets.length && tickets.length > 0;

  // Use card layout on mobile and tablet (< 1024px) for better touch experience
  // Use table layout only on desktop (>= 1024px)
  const useCardLayout = isMobile || isTablet;

  // Handle long press to enable selection mode on mobile/tablet (card layout)
  const handleLongPress = (ticketId: string) => {
    if (useCardLayout && !selectionMode) {
      // Enter selection mode and select the long-pressed item
      onSelectionModeChange?.(true);
      onSelectTicket?.(ticketId, true);
    }
  };

  // Calculate unread count (messages from requesters that technician hasn't read)
  const unreadCount = tickets.filter(ticket => ticket.technicianHasUnread).length;

  const handleSelectAll = (checked: boolean) => {
    onSelectAll?.(checked);
  };

  const handleSelectTicket = (ticketId: string, selected: boolean) => {
    onSelectTicket?.(ticketId, selected);
  };

  const handleUnreadToggle = (checked: boolean) => {
    onUnreadFilterChange?.(checked);
  };

  // Mobile & Tablet: Card layout (< 1024px) for touch-friendly interface
  if (useCardLayout) {
    return (
      <div className="flex-1 min-h-0 border border-border rounded-md overflow-auto scrollbar-fluent-always" data-debug="cards-container">
        {/* Unread filter - always visible when there are unread tickets */}
        {unreadCount > 0 && !selectionMode && (
          <div className="sticky top-0 z-10 bg-muted/50 border-b border-border px-3 py-2 flex items-center justify-end gap-2">
            <Badge
              variant="secondary"
              className="text-xs px-1.5 py-0 h-5 bg-orange-100 dark:bg-orange-950/50 text-orange-800 dark:text-orange-200"
            >
              {unreadCount} unread
            </Badge>
            <Switch
              checked={showUnreadOnly}
              onCheckedChange={handleUnreadToggle}
              className="h-5 w-9 data-[state=checked]:bg-orange-600"
              aria-label="Show unread only"
            />
          </div>
        )}

        {/* Selection mode header - only show when in selection mode (long press activated) */}
        {selectionMode && (
          <div className="sticky top-0 z-10 bg-muted/50 border-b border-border p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={selectAll}
                onCheckedChange={handleSelectAll}
                className="h-5 w-5"
              />
              <span className="text-xs font-medium text-muted-foreground">
                {selectedTickets.size > 0 ? `${selectedTickets.size} selected` : 'Select all'}
              </span>
            </div>
            {unreadCount > 0 && (
              <div className="flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className="text-xs px-1.5 py-0 h-5 bg-orange-100 dark:bg-orange-950/50 text-orange-800 dark:text-orange-200"
                >
                  {unreadCount} unread
                </Badge>
                <Switch
                  checked={showUnreadOnly}
                  onCheckedChange={handleUnreadToggle}
                  className="h-5 w-9 data-[state=checked]:bg-orange-600"
                  aria-label="Show unread only"
                />
              </div>
            )}
          </div>
        )}

        {/* Card list */}
        <div>
          {tickets.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              isSelected={selectedTickets.has(ticket.id)}
              showCheckbox={selectionMode}
              onSelect={handleSelectTicket}
              onLongPress={handleLongPress}
            />
          ))}
        </div>
      </div>
    );
  }

  // Desktop: Table layout (>= 1024px) with full column visibility
  return (
    <div className="flex-1 min-h-0 border border-border rounded-md overflow-auto scrollbar-fluent-always" data-debug="table-container">
      <table className="caption-bottom text-sm" data-debug="table-actual">
        <thead className="sticky top-0 z-10 bg-background [&_tr]:border-b">
            <tr className="bg-muted/50 border-b-2 border-border">
              <th className={`${thBaseClass} min-w-[40px]`}>
                <Checkbox
                  checked={selectAll}
                  onCheckedChange={handleSelectAll}
                />
              </th>
              <th className={`${thBaseClass} ${thTextClass} min-w-[180px]`}>
                <div className="flex items-center gap-2">
                  <span>Status</span>
                  {unreadCount > 0 && (
                    <div className="flex items-center gap-1.5 ml-auto">
                      <Badge
                        variant="secondary"
                        className="text-xs px-1.5 py-0 h-5 bg-orange-100 dark:bg-orange-950/50 text-orange-800 dark:text-orange-200"
                      >
                        {unreadCount}
                      </Badge>
                      <Switch
                        checked={showUnreadOnly}
                        onCheckedChange={handleUnreadToggle}
                        className="h-4 w-8 data-[state=checked]:bg-orange-600"
                        aria-label="Show unread only"
                      />
                    </div>
                  )}
                </div>
              </th>
              <th className={`${thBaseClass} ${thTextClass} min-w-[300px]`}>
                <div className="flex items-center">
                  Subject
                  <ArrowDown className="ml-1 h-3 w-3 text-muted-foreground/60" />
                </div>
              </th>
              <th className={`${thBaseClass} ${thTextClass} min-w-[150px]`}>
                <div className="flex items-center">
                  Requester
                  <ArrowDown className="ml-1 h-3 w-3 text-muted-foreground/60" />
                </div>
              </th>
              <th className={`${thBaseClass} ${thTextClass} min-w-[120px]`}>
                <div className="flex items-center">
                  Requested
                  <ArrowDown className="ml-1 h-3 w-3 text-muted-foreground/60" />
                </div>
              </th>
              <th className={`${thBaseClass} ${thTextClass} min-w-[120px]`}>
                <div className="flex items-center">
                  Due Date
                  <ArrowDown className="ml-1 h-3 w-3 text-muted-foreground/60" />
                </div>
              </th>
              <th className={`${thBaseClass} ${thTextClass} min-w-[100px]`}>
                <div className="flex items-center">
                  Priority
                  <ArrowDown className="ml-1 h-3 w-3 text-muted-foreground/60" />
                </div>
              </th>
              <th className={`${thBaseClass} ${thTextClass} min-w-[100px]`}>
                <div className="flex items-center">
                  Tag
                  <ArrowDown className="ml-1 h-3 w-3 text-muted-foreground/60" />
                </div>
              </th>
              <th className={`${thBaseClass} ${thTextClass} min-w-[150px]`}>
                <div className="flex items-center">
                  Business Unit
                  <ArrowDown className="ml-1 h-3 w-3 text-muted-foreground/60" />
                </div>
              </th>
              <th className={`${thBaseClass} ${thTextClass} min-w-[200px]`}>
                Last Message
              </th>
              <th className={`${thBaseClass} min-w-[100px]`}></th>
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-0">
            {/* Ticket Rows */}
            {tickets.map((ticket) => (
              <TicketsTableRow
                key={ticket.id}
                ticket={ticket}
                isSelected={selectedTickets.has(ticket.id)}
                onSelect={handleSelectTicket}
                onTicketClick={onTicketClick}
              />
            ))}
          </tbody>
        </table>
      </div>
  );
}
