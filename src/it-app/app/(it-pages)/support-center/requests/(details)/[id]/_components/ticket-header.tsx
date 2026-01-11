"use client";

import { Filter, History, MoreVertical, FileText, Printer, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface TicketHeaderProps {
  title: string;
  source?: string;
}

export function TicketHeader({ title, source = "sample ticket" }: TicketHeaderProps) {
  return (
    <div className="bg-card border-b border-border p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          <Badge variant="secondary" className="mt-1">
            Via {source}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm">
                <Filter className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Filter messages</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm">
                <History className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>View history</TooltipContent>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <FileText className="h-4 w-4 mr-2" />
                View summary
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Printer className="h-4 w-4 mr-2" />
                Print ticket
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Share2 className="h-4 w-4 mr-2" />
                Share ticket
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <Button variant="link" className="text-primary p-0 h-auto mt-2">
        View ticket summary
      </Button>
    </div>
  );
}
