"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, XCircle, Clock, AlertCircle, History, Loader2 } from "lucide-react";
import type { ScheduledJob, JobExecution } from "@/lib/actions/scheduler.actions";

interface JobExecutionsSheetProps {
  job: ScheduledJob | null;
  executions: JobExecution[];
  isLoading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function JobExecutionsSheet({
  job,
  executions,
  isLoading,
  open,
  onOpenChange,
}: JobExecutionsSheetProps) {
  if (!job) return null;

  // Show only the last 20 executions (UI only - no database changes)
  const displayExecutions = executions.slice(0, 20);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "running":
        return <Clock className="h-4 w-4 text-blue-500 animate-spin" />;
      case "timeout":
        return <AlertCircle className="h-4 w-4 text-orange-500" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full sm:max-w-3xl lg:max-w-4xl flex flex-col p-0"
        side="right"
      >
        {/* Fixed Header */}
        <SheetHeader className="px-6 py-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <SheetTitle className="flex items-center gap-3 text-lg font-semibold">
            <div className="p-2 bg-primary/10 rounded-lg">
              <History className="h-5 w-5 text-primary" />
            </div>
            Execution History
          </SheetTitle>
          <SheetDescription className="text-sm text-muted-foreground">
            Recent executions for <strong className="text-foreground">{job.name}</strong>
          </SheetDescription>
        </SheetHeader>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-6">
              {isLoading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center">
                    <Clock className="h-8 w-8 mb-2 mx-auto text-muted-foreground animate-spin" />
                    <p className="text-sm text-muted-foreground">Loading executions...</p>
                  </div>
                </div>
              ) : displayExecutions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <div className="p-4 bg-muted/50 rounded-full mb-4">
                    <Clock className="h-12 w-12" />
                  </div>
                  <p className="text-base font-medium">No executions found</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    This job hasn&apos;t been executed yet
                  </p>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-semibold">Status</TableHead>
                        <TableHead className="font-semibold">Triggered By</TableHead>
                        <TableHead className="font-semibold">Started</TableHead>
                        <TableHead className="font-semibold">Duration</TableHead>
                        <TableHead className="font-semibold">Result</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayExecutions.map((execution) => (
                        <TableRow key={execution.id} className="hover:bg-muted/50">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getStatusIcon(execution.status)}
                              <Badge
                                variant={
                                  execution.status === "success"
                                    ? "default"
                                    : execution.status === "failed"
                                    ? "destructive"
                                    : "secondary"
                                }
                                className="capitalize"
                              >
                                {execution.status}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm capitalize">
                              {execution.triggeredBy}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">
                              {formatDistanceToNow(new Date(execution.startedAt), {
                                addSuffix: true,
                              })}
                            </span>
                          </TableCell>
                          <TableCell>
                            {execution.durationSeconds ? (
                              <span className="text-sm font-mono">
                                {execution.durationSeconds.toFixed(2)}s
                              </span>
                            ) : (
                              <span className="text-sm text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {execution.errorMessage ? (
                              <div className="max-w-[300px]">
                                <span className="text-sm text-red-500 block truncate" title={execution.errorMessage}>
                                  {execution.errorMessage}
                                </span>
                              </div>
                            ) : execution.result ? (
                              <div className="max-w-[300px]">
                                <span className="text-sm text-muted-foreground block truncate font-mono" title={JSON.stringify(execution.result)}>
                                  {JSON.stringify(execution.result)}
                                </span>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
