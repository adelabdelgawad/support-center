'use client';

import Link from 'next/link';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ChevronRight } from 'lucide-react';
import { StatusBadge } from '@/components/ui/status-badge';
import type { RequestListItem as Ticket } from '@/types/requests-list';
import { useFormattedDate, useFormattedDueDate } from '@/lib/utils/hydration-safe-date';

interface TicketsTableRowProps {
  ticket: Ticket;
  isSelected?: boolean;
  onSelect?: (ticketId: string, selected: boolean) => void;
  onTicketClick?: (ticketId: string) => void;
}

// Common cell styles
const tdBaseClass = "p-2 align-middle whitespace-nowrap";

/**
 * Get priority badge color based on priority name
 */
function getPriorityColor(priorityName: string): string {
  const lower = priorityName.toLowerCase();
  if (lower.includes('critical') || lower.includes('urgent')) return 'text-red-600 font-semibold';
  if (lower.includes('high')) return 'text-orange-600 font-semibold';
  if (lower.includes('medium') || lower.includes('normal')) return 'text-yellow-600';
  return 'text-gray-600'; // Low/Lowest
}

/**
 * Format due date and check if overdue
 * @deprecated Use useFormattedDueDate hook instead to avoid hydration mismatches
 */
function formatDueDate(dateString: string | null): { text: string; isOverdue: boolean } {
  if (!dateString) return { text: '-', isOverdue: false };

  const date = new Date(dateString);

  // Check for invalid date (prevents NaN display)
  if (isNaN(date.getTime())) {
    return { text: '-', isOverdue: false };
  }

  const now = new Date();
  const isOverdue = date < now;

  const diffMs = Math.abs(date.getTime() - now.getTime());
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  let text: string;

  if (diffDays > 0) {
    text = `${diffDays}d ${diffHours % 24}h`;
  } else {
    text = `${diffHours}h`;
  }

  if (isOverdue) {
    text = `${text} overdue`;
  } else {
    text = `in ${text}`;
  }

  return { text, isOverdue };
}

export function TicketsTableRow({
  ticket,
  isSelected = false,
  onSelect,
  onTicketClick,
}: TicketsTableRowProps) {
  // Hydration-safe date formatting
  const requestedTime = useFormattedDate(ticket.requested);
  const { text: dueDateText, isOverdue } = useFormattedDueDate(ticket.dueDate);

  const handleRowClick = (e: React.MouseEvent) => {
    // Don't navigate if clicking on the subject link
    const target = e.target as HTMLElement;
    if (target.tagName === 'A' || target.closest('a')) {
      return;
    }

    // Toggle selection on row click
    onSelect?.(ticket.id, !isSelected);
  };

  const rowClassName = `border-b border-border hover:bg-accent/50 cursor-pointer transition-all ${
    isSelected
      ? 'bg-accent/30 h-14'
      : ticket.technicianHasUnread
        ? 'bg-orange-50 dark:bg-orange-950/30 h-12'
        : 'h-12'
  }`;

  return (
    <tr className={rowClassName} onClick={handleRowClick}>
      <td className={tdBaseClass}>
        <div className="flex items-center justify-center">
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => onSelect?.(ticket.id, !!checked)}
          />
        </div>
      </td>

      {/* Status */}
      <td className={tdBaseClass}>
        <StatusBadge status={ticket.status} />
      </td>

      {/* Subject */}
      <td className={tdBaseClass} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          {ticket.parentTaskId && (
            <div className="flex items-center gap-1 text-muted-foreground flex-shrink-0">
              <ChevronRight className="h-3 w-3" />
              <Badge variant="outline" className="text-xs px-1.5 py-0 h-5">
                Subtask
              </Badge>
            </div>
          )}
          <Link
            href={`/support-center/requests/${ticket.id}`}
            className="text-primary hover:text-primary/80 hover:underline"
          >
            {ticket.subject}
          </Link>
        </div>
      </td>

      {/* Requester */}
      <td className={`${tdBaseClass} text-sm text-foreground`}>
        {ticket.requester.fullName || 'Unknown'}
      </td>

      {/* Requested */}
      <td className={`${tdBaseClass} text-sm text-muted-foreground`}>
        {requestedTime}
      </td>

      {/* Due Date */}
      <td className={tdBaseClass}>
        <span
          className={`text-sm ${
            isOverdue
              ? 'text-red-600 font-semibold'
              : dueDateText === '-'
              ? 'text-muted-foreground'
              : 'text-foreground'
          }`}
        >
          {dueDateText}
        </span>
      </td>

      {/* Priority */}
      <td className={tdBaseClass}>
        <span className={getPriorityColor(ticket.priority.name)}>
          {ticket.priority.name}
        </span>
      </td>

      {/* Tag */}
      <td className={`${tdBaseClass} text-sm text-foreground`}>
        {ticket.tag ? (
          <span className="text-sm">{ticket.tag.nameEn}</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </td>

      {/* Business Unit */}
      <td className={`${tdBaseClass} text-sm text-foreground`}>
        {ticket.businessUnit?.name || (
          <span className="text-muted-foreground">Unassigned</span>
        )}
      </td>

      {/* Last Message */}
      <td className={`${tdBaseClass} text-sm text-muted-foreground max-w-xs truncate`}>
        {ticket.lastMessage ? (
          <div>
            <span className="font-medium text-foreground">
              {ticket.lastMessage.senderName || 'Unknown'}:
            </span>{' '}
            {ticket.lastMessage.content.substring(0, 50)}
            {ticket.lastMessage.content.length > 50 ? '...' : ''}
          </div>
        ) : (
          <span className="text-muted-foreground/50">No messages</span>
        )}
      </td>

      {/* Actions column (empty for now) */}
      <td className={tdBaseClass}></td>
    </tr>
  );
}
