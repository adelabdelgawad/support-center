"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";
import type { ScheduledJob, JobExecution } from "@/lib/actions/scheduler.actions";

interface JobExecutionsDialogProps {
  job: ScheduledJob;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function JobExecutionsDialog({
  job,
  open,
  onOpenChange,
}: JobExecutionsDialogProps) {
  const [executions, setExecutions] = useState<JobExecution[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Show only the last 20 executions (UI only - no database changes)
  const displayExecutions = executions.slice(0, 20);

  useEffect(() => {
    if (open && job) {
      fetchExecutions();
    }
  }, [open, job.id]);

  const fetchExecutions = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/scheduler/jobs/${job.id}/executions?per_page=20`,
        {
          credentials: "include",
        }
      );
      if (response.ok) {
        const data = await response.json();
        setExecutions(data.executions || []);
      }
    } catch (error) {
      console.error("Failed to fetch executions:", error);
    } finally {
      setIsLoading(false);
    }
  };

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Execution History</DialogTitle>
          <DialogDescription>
            Recent executions for <strong>{job.name}</strong>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[500px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-sm text-muted-foreground">Loading...</p>
            </div>
          ) : displayExecutions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
              <Clock className="h-8 w-8 mb-2" />
              <p>No executions found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Triggered By</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayExecutions.map((execution) => (
                  <TableRow key={execution.id}>
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
                        <span className="text-sm">
                          {execution.durationSeconds.toFixed(2)}s
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {execution.errorMessage ? (
                        <span className="text-sm text-red-500 max-w-[200px] truncate">
                          {execution.errorMessage}
                        </span>
                      ) : execution.result ? (
                        <span className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {JSON.stringify(execution.result)}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
