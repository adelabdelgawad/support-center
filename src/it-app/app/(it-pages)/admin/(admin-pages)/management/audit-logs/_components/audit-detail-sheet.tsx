"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { AuditLog } from "@/types/audit";

interface AuditDetailSheetProps {
  log: AuditLog | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFilterByCorrelation?: (correlationId: string) => void;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className="text-sm">{value || "-"}</span>
    </div>
  );
}

function DiffView({ oldValues, newValues }: { oldValues: Record<string, unknown> | null; newValues: Record<string, unknown> | null }) {
  if (!oldValues && !newValues) return null;

  const allKeys = new Set([
    ...Object.keys(oldValues || {}),
    ...Object.keys(newValues || {}),
  ]);

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Changes</h4>
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left p-2 font-medium">Field</th>
              <th className="text-left p-2 font-medium">Old</th>
              <th className="text-left p-2 font-medium">New</th>
            </tr>
          </thead>
          <tbody>
            {Array.from(allKeys).map((key) => {
              const oldVal = oldValues?.[key];
              const newVal = newValues?.[key];
              const changed = JSON.stringify(oldVal) !== JSON.stringify(newVal);
              return (
                <tr key={key} className={changed ? "bg-yellow-50/50 dark:bg-yellow-900/10" : ""}>
                  <td className="p-2 font-mono text-xs">{key}</td>
                  <td className="p-2 text-xs text-red-600 dark:text-red-400">
                    {oldVal !== undefined ? String(oldVal) : "-"}
                  </td>
                  <td className="p-2 text-xs text-green-600 dark:text-green-400">
                    {newVal !== undefined ? String(newVal) : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AuditDetailSheet({ log, open, onOpenChange, onFilterByCorrelation }: AuditDetailSheetProps) {
  if (!log) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Audit Log Detail</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <DetailRow label="User" value={log.userFullName || "System"} />
            <DetailRow label="Username" value={log.username} />
            <DetailRow
              label="Action"
              value={<Badge variant="outline">{log.action}</Badge>}
            />
            <DetailRow
              label="Resource Type"
              value={<Badge variant="secondary">{log.resourceType}</Badge>}
            />
            <DetailRow label="Resource ID" value={
              <span className="font-mono text-xs">{log.resourceId}</span>
            } />
            <DetailRow label="Timestamp" value={new Date(log.createdAt).toLocaleString()} />
            <DetailRow label="IP Address" value={
              <span className="font-mono text-xs">{log.ipAddress}</span>
            } />
            <DetailRow
              label="Correlation ID"
              value={
                log.correlationId ? (
                  <button
                    onClick={() => {
                      onFilterByCorrelation?.(log.correlationId!);
                      onOpenChange(false);
                    }}
                    className="font-mono text-xs text-blue-600 hover:underline cursor-pointer"
                  >
                    {log.correlationId}
                  </button>
                ) : null
              }
            />
          </div>

          <DetailRow label="Endpoint" value={
            <span className="font-mono text-xs">{log.endpoint}</span>
          } />
          <DetailRow label="User Agent" value={
            <span className="text-xs break-all">{log.userAgent}</span>
          } />
          <DetailRow label="Summary" value={log.changesSummary} />

          {(log.oldValues || log.newValues) && (
            <>
              <Separator />
              <DiffView oldValues={log.oldValues} newValues={log.newValues} />
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
