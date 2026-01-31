"use client";

import { useState } from 'react';
import { ChevronRight, Mail, User as UserIcon, Building, Phone, FileText, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { useRequestDetail } from '../_context/request-detail-context';
import { SubTasksPanel } from './sub-tasks-panel';
import { useUserStatus } from '@/lib/hooks/use-user-status';
import { cn } from '@/lib/utils';
import { formatShortDateTime } from '@/lib/utils/date-formatting';

/**
 * Get initials from a name
 */
function getInitials(name: string): string {
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

/**
 * Truncate text with ellipsis
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

export function UserInfoSidebar() {
  // Get all data from context (no props, no client-side fetching!)
  const { ticket, notes } = useRequestDetail();
  const [isVisible, setIsVisible] = useState(true);

  // Check if current status is "count_as_solved" - solved tickets are static
  const isStatusSolved = ticket.status?.countAsSolved === true;

  // Fetch user session status using SWR hook - automatic deduplication & polling
  // Only fetch when sidebar is visible and ticket is not solved
  const { userStatus } = useUserStatus(
    ticket.requesterId,
    isVisible && !isStatusSolved
  );

  // Build user info from ticket requester
  const user = {
    name: ticket.requester.fullName || ticket.requester.username,
    initials: getInitials(ticket.requester.fullName || ticket.requester.username),
    email: ticket.requester.email || '',
    title: ticket.requester.title || '',
    directManager: ticket.requester.managerName || '',
    office: ticket.requester.office || '',
    phoneNumber: ticket.requester.phoneNumber || '',
  };

  if (!isVisible) {
    return (
      <div className="border-l border-border bg-card relative w-0 min-w-0 h-full flex-shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsVisible(true)}
              className="fixed right-0 top-[calc(50vh+24px)] -translate-y-1/2 z-[100] h-9 w-9 rounded-md"
            >
              <ChevronRight className="h-4 w-4 rotate-180" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Show user info</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="w-full md:w-80 border-l border-border bg-card relative flex-shrink-0">
      {/* Close button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsVisible(false)}
            className="absolute right-2 top-2 h-8 w-8 z-10"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">Close sidebar</TooltipContent>
      </Tooltip>

      <ScrollArea className="h-full">
        <div className="p-3">
          {/* If this is a subtask, show technician who created it first */}
          {ticket.parentRequestId && ticket.createdByTechnician && (
            <>
              <div className="mb-3 mt-6">
                <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                  Created By Technician
                </div>
                <div className="flex items-start gap-3 mb-2">
                  <Avatar className="h-12 w-12 flex-shrink-0">
                    <AvatarFallback className="bg-blue-500/10 text-blue-600 text-base font-semibold">
                      {getInitials(ticket.createdByTechnician.fullName || ticket.createdByTechnician.username)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-base leading-tight truncate">
                      {ticket.createdByTechnician.fullName || ticket.createdByTechnician.username}
                    </h3>
                    <div className="text-xs text-muted-foreground mb-1 truncate">
                      @{ticket.createdByTechnician.username}
                    </div>
                  </div>
                </div>
                {/* Technician Contact Details */}
                <div className="space-y-1.5 mb-3">
                  {ticket.createdByTechnician.email && (
                    <a
                      href={`mailto:${ticket.createdByTechnician.email}`}
                      className="flex items-center gap-2 text-sm py-1 px-2 -mx-2 rounded-md hover:bg-accent/50 transition-colors group"
                    >
                      <Mail className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-foreground truncate group-hover:text-primary">
                        {truncate(ticket.createdByTechnician.email, 30)}
                      </span>
                    </a>
                  )}
                  {ticket.createdByTechnician.office && (
                    <div className="flex items-center gap-2 text-sm py-1 px-2 -mx-2">
                      <Building className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-foreground truncate">{ticket.createdByTechnician.office}</span>
                    </div>
                  )}
                </div>
              </div>
              <Separator className="mb-3" />
              <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                Original Requester
              </div>
            </>
          )}

          {/* Compact User Profile Header */}
          <div className="mb-3 mt-6">
            {/* Avatar + Name + Status Row */}
            <div className="flex items-start gap-3 mb-2">
              <Avatar className="h-12 w-12 flex-shrink-0">
                <AvatarFallback className="bg-primary/10 text-primary text-base font-semibold">
                  {user.initials}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                {/* Name and presence indicator */}
                <div className="flex items-center gap-2 mb-0.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <h3 className="font-semibold text-base leading-tight truncate">
                        {user.name}
                      </h3>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="start">
                      {user.name}
                    </TooltipContent>
                  </Tooltip>

                  {userStatus && (
                    <Tooltip>
                      <TooltipTrigger>
                        <Circle
                          className={cn(
                            "h-2 w-2 fill-current flex-shrink-0",
                            userStatus.isOnline ? "text-green-500" : "text-muted-foreground/40"
                          )}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        <div className="text-xs space-y-1">
                          <div className="font-medium">{userStatus.isOnline ? "Online" : "Offline"}</div>
                          {userStatus.isOnline && userStatus.connections && userStatus.connections.length > 0 && (
                            <div className="text-muted-foreground space-y-1">
                              {userStatus.connections.map((conn, idx) => (
                                <div key={idx} className="flex flex-col gap-0.5">
                                  <div className="font-mono text-xs">{conn.ipAddress}</div>
                                  {conn.userAgent && (
                                    <div className="text-[10px] opacity-70 truncate max-w-[200px]">
                                      {conn.userAgent}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>

                {/* Username - subtle, smaller */}
                <div className="text-xs text-muted-foreground mb-1 truncate">
                  @{ticket.requester.username}
                </div>

                {/* Job title */}
                {user.title && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {user.title}
                      </p>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="start">
                      {user.title}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          </div>

          <Separator className="mb-3" />

          {/* Compact Contact Details */}
          <div className="space-y-1.5 mb-3">
            {user.email && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={`mailto:${user.email}`}
                    className="flex items-center gap-2 text-sm py-1 px-2 -mx-2 rounded-md hover:bg-accent/50 transition-colors group"
                  >
                    <Mail className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="text-foreground truncate group-hover:text-primary">
                      {truncate(user.email, 30)}
                    </span>
                  </a>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="start">
                  <div className="text-xs">
                    <div className="font-medium">Email</div>
                    <div className="text-muted-foreground">{user.email}</div>
                  </div>
                </TooltipContent>
              </Tooltip>
            )}

            {user.phoneNumber && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={`tel:${user.phoneNumber}`}
                    className="flex items-center gap-2 text-sm py-1 px-2 -mx-2 rounded-md hover:bg-accent/50 transition-colors group"
                  >
                    <Phone className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="text-foreground group-hover:text-primary">
                      {user.phoneNumber}
                    </span>
                  </a>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="start">Call this number</TooltipContent>
              </Tooltip>
            )}

            {user.office && (
              <div className="flex items-center gap-2 text-sm py-1 px-2 -mx-2">
                <Building className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-foreground truncate">{user.office}</span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="start">{user.office}</TooltipContent>
                </Tooltip>
              </div>
            )}

            {user.directManager && (
              <div className="flex items-center gap-2 text-sm py-1 px-2 -mx-2">
                <UserIcon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-foreground truncate">{user.directManager}</span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="start">
                    <div className="text-xs">
                      <div className="font-medium">Manager</div>
                      <div className="text-muted-foreground">{user.directManager}</div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>

          <Separator className="mb-3" />

          {/* Sub-Tasks section - only show for top-level requests, not for subtasks */}
          {ticket.id && !ticket.parentRequestId && (
            <>
              <div>
                <SubTasksPanel requestId={ticket.id} />
              </div>
              <Separator className="my-3" />
            </>
          )}

          {/* Compact Notes section */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              <h4 className="font-medium text-sm">Notes</h4>
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {notes.length}
              </Badge>
            </div>

            {notes.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3 bg-muted/30 rounded-md">
                No notes yet
              </p>
            ) : (
              <div className="space-y-2">
                {notes.map((note) => (
                  <Card key={note.id} className="shadow-sm">
                    <CardContent className="p-2.5">
                      <p className="text-xs text-foreground whitespace-pre-wrap break-words leading-relaxed">
                        {note.note}
                      </p>
                      <div className="flex items-center justify-between mt-2 pt-2 border-t">
                        <span className="text-[10px] text-muted-foreground font-medium truncate max-w-[60%]">
                          {note.createdBy.fullName || note.createdBy.username}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {formatShortDateTime(note.createdAt)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
