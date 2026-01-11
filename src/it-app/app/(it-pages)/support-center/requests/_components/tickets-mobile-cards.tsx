'use client';

import { Clock, User, Calendar, AlertCircle } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { RequestListItem as Ticket } from '@/types/requests-list';

interface TicketsMobileCardsProps {
  tickets: Ticket[];
  selectedTickets: Set<string>;
  onTicketClick?: (ticketId: string) => void;
  onSelectTicket?: (ticketId: string, selected: boolean) => void;
}

export function TicketsMobileCards({
  tickets,
  selectedTickets,
  onTicketClick,
  onSelectTicket,
}: TicketsMobileCardsProps) {
  const handleCardClick = (e: React.MouseEvent, ticketId: string) => {
    // Don't trigger if clicking checkbox
    if ((e.target as HTMLElement).closest('[data-checkbox]')) {
      return;
    }
    onTicketClick?.(ticketId);
  };

  const handleCheckboxChange = (ticketId: string, checked: boolean) => {
    onSelectTicket?.(ticketId, checked);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex-1 min-h-0 overflow-auto space-y-2 p-2">
      {tickets.map((ticket) => {
        const isSelected = selectedTickets.has(ticket.id);
        const hasUnread = ticket.technicianHasUnread;

        return (
          <div
            key={ticket.id}
            onClick={(e) => handleCardClick(e, ticket.id)}
            className={cn(
              'bg-card border rounded-lg p-4 cursor-pointer transition-colors',
              'hover:bg-accent/50 active:bg-accent',
              isSelected && 'ring-2 ring-primary border-primary',
              hasUnread && 'border-l-4 border-l-orange-500'
            )}
          >
            {/* Header Row */}
            <div className="flex items-start gap-3 mb-3">
              <div data-checkbox className="pt-0.5">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(checked) => handleCheckboxChange(ticket.id, !!checked)}
                />
              </div>

              <div className="flex-1 min-w-0">
                {/* Status Badge */}
                <div className="mb-2">
                  <Badge
                    variant="secondary"
                    className={cn(
                      'text-xs font-medium',
                      ticket.status?.color && `bg-[${ticket.status.color}]/10 text-[${ticket.status.color}]`
                    )}
                  >
                    {ticket.status?.name || 'No Status'}
                  </Badge>
                  {hasUnread && (
                    <Badge
                      variant="secondary"
                      className="ml-2 text-xs bg-orange-100 dark:bg-orange-950/50 text-orange-800 dark:text-orange-200"
                    >
                      Unread
                    </Badge>
                  )}
                </div>

                {/* Subject */}
                <h3 className="font-semibold text-sm text-foreground mb-1 line-clamp-2">
                  {ticket.subject || 'No Subject'}
                </h3>

                {/* Metadata Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground mt-3">
                  {/* Requester */}
                  <div className="flex items-center gap-1">
                    <User className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{ticket.requester?.fullName || 'Unknown'}</span>
                  </div>

                  {/* Priority */}
                  <div className="flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{ticket.priority?.name || 'No Priority'}</span>
                  </div>

                  {/* Created Date */}
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{formatDate(ticket.requested)}</span>
                  </div>

                  {/* Due Date */}
                  {ticket.dueDate && (
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate text-orange-600 dark:text-orange-400">
                        Due {formatDate(ticket.dueDate)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Business Unit */}
                {ticket.businessUnit?.name && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    <span className="font-medium">BU:</span> {ticket.businessUnit.name}
                  </div>
                )}

                {/* Last Message Preview */}
                {ticket.lastMessage?.content && (
                  <div className="mt-2 text-xs text-muted-foreground border-t pt-2">
                    <p className="line-clamp-2">{ticket.lastMessage.content}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Empty State */}
      {tickets.length === 0 && (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <p className="text-sm">No tickets found</p>
        </div>
      )}
    </div>
  );
}
