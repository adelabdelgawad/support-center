'use client';

/**
 * Bulk Status Change Dialog
 *
 * Dialog for changing status of multiple tickets at once.
 * Includes:
 * - Status dropdown (excludes ID 1 - Pending)
 * - Resolution input for statuses 6 and 8
 * - Confirmation with count of affected tickets
 * - Progress/loading feedback
 */

import { useState, useCallback, useEffect } from 'react';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/custom-toast';

// Status IDs that require resolution text
// Status 3 = Solved, Status 5 = Canceled
const RESOLUTION_REQUIRED_STATUS_IDS = [3, 5];

// Status interface
interface RequestStatus {
  id: number;
  name: string;
  color: string | null;
}

// Status color mapping
const STATUS_COLORS: Record<string, string> = {
  yellow: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
  blue: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
  green: 'bg-green-500/10 text-green-600 border-green-500/30',
  red: 'bg-red-500/10 text-red-600 border-red-500/30',
  orange: 'bg-orange-500/10 text-orange-600 border-orange-500/30',
  purple: 'bg-purple-500/10 text-purple-600 border-purple-500/30',
  gray: 'bg-gray-500/10 text-gray-600 border-gray-500/30',
};

function getStatusColorClass(color: string | null): string {
  if (!color) return STATUS_COLORS.gray;
  return STATUS_COLORS[color.toLowerCase()] || STATUS_COLORS.gray;
}

interface BulkStatusChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTicketIds: string[];
  onSuccess?: () => void;
}

export function BulkStatusChangeDialog({
  open,
  onOpenChange,
  selectedTicketIds,
  onSuccess,
}: BulkStatusChangeDialogProps) {
  const [statuses, setStatuses] = useState<RequestStatus[]>([]);
  const [selectedStatusId, setSelectedStatusId] = useState<string>('');
  const [resolution, setResolution] = useState('');
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingStatuses, setIsLoadingStatuses] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [results, setResults] = useState<{ success: number; failed: number }>({ success: 0, failed: 0 });

  // Fetch statuses when dialog opens
  useEffect(() => {
    if (open && statuses.length === 0) {
      fetchStatuses();
    }
  }, [open, statuses.length]);

  const fetchStatuses = async () => {
    setIsLoadingStatuses(true);
    try {
      const response = await fetch('/api/metadata/statuses');
      if (response.ok) {
        const data = await response.json();
        // data.statuses contains the array of statuses
        const statusList = Array.isArray(data) ? data : data.statuses || [];
        // Filter out status ID 1 (Pending)
        setStatuses(statusList.filter((s: RequestStatus) => s.id !== 1));
      }
    } catch (error) {
      console.error('Failed to fetch statuses:', error);
      toast.error('Failed to load statuses');
    } finally {
      setIsLoadingStatuses(false);
    }
  };

  // Check if selected status requires resolution
  const requiresResolution = selectedStatusId
    ? RESOLUTION_REQUIRED_STATUS_IDS.includes(parseInt(selectedStatusId, 10))
    : false;

  // Get selected status info
  const selectedStatus = statuses.find(s => s.id.toString() === selectedStatusId);

  // Handle status change submission
  const handleSubmit = useCallback(async () => {
    if (!selectedStatusId) return;

    const statusId = parseInt(selectedStatusId, 10);

    // Validate resolution if required
    if (requiresResolution) {
      if (!resolution.trim()) {
        setResolutionError('Resolution is required for this status');
        return;
      }
      if (resolution.length > 2000) {
        setResolutionError('Resolution must not exceed 2000 characters');
        return;
      }
    }

    setIsLoading(true);
    setProgress({ completed: 0, total: selectedTicketIds.length });
    setResults({ success: 0, failed: 0 });

    let successCount = 0;
    let failedCount = 0;

    // Process each ticket
    for (let i = 0; i < selectedTicketIds.length; i++) {
      const ticketId = selectedTicketIds[i];
      try {
        const payload: { statusId: number; resolution?: string } = { statusId };
        if (requiresResolution) {
          payload.resolution = resolution.trim();
        }

        const response = await fetch(`/api/requests-details/${ticketId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          successCount++;
        } else {
          failedCount++;
        }
      } catch (error) {
        console.error(`Failed to update ticket ${ticketId}:`, error);
        failedCount++;
      }

      setProgress({ completed: i + 1, total: selectedTicketIds.length });
      setResults({ success: successCount, failed: failedCount });
    }

    setIsLoading(false);

    // Show result toast
    if (failedCount === 0) {
      toast.success(`Successfully updated ${successCount} ticket${successCount > 1 ? 's' : ''}`);
    } else if (successCount === 0) {
      toast.error(`Failed to update all ${failedCount} ticket${failedCount > 1 ? 's' : ''}`);
    } else {
      toast.success(`Updated ${successCount} ticket${successCount > 1 ? 's' : ''}, ${failedCount} failed`);
    }

    // Close dialog and trigger refresh
    onOpenChange(false);
    onSuccess?.();

    // Reset state
    setSelectedStatusId('');
    setResolution('');
    setResolutionError(null);
  }, [selectedStatusId, resolution, requiresResolution, selectedTicketIds, onOpenChange, onSuccess]);

  // Handle cancel/close
  const handleClose = () => {
    if (isLoading) return; // Prevent closing while processing
    onOpenChange(false);
    setSelectedStatusId('');
    setResolution('');
    setResolutionError(null);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Change Status</DialogTitle>
          <DialogDescription>
            Change the status of{' '}
            <span className="font-semibold text-foreground">
              {selectedTicketIds.length} selected ticket{selectedTicketIds.length > 1 ? 's' : ''}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Status Selection */}
          <div>
            <Label className="text-sm font-medium mb-2 block">New Status</Label>
            <Select
              value={selectedStatusId}
              onValueChange={(value) => {
                setSelectedStatusId(value);
                setResolutionError(null);
              }}
              disabled={isLoading || isLoadingStatuses}
            >
              <SelectTrigger className="w-full">
                {isLoadingStatuses ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading statuses...</span>
                  </div>
                ) : selectedStatus ? (
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`${getStatusColorClass(selectedStatus.color)} font-medium`}
                    >
                      {selectedStatus.name}
                    </Badge>
                  </div>
                ) : (
                  <SelectValue placeholder="Select a status..." />
                )}
              </SelectTrigger>
              <SelectContent>
                {statuses.map((status) => {
                  const colorClass = getStatusColorClass(status.color);
                  return (
                    <SelectItem key={status.id} value={status.id.toString()}>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={`${colorClass} font-medium`}
                        >
                          {status.name}
                        </Badge>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Resolution Input (for statuses 6 and 8) */}
          {requiresResolution && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <Label className="text-sm font-medium">
                  Resolution <span className="text-destructive">*</span>
                </Label>
              </div>
              <Textarea
                className="w-full"
                rows={4}
                placeholder="Enter resolution details (will be applied to all selected tickets)..."
                value={resolution}
                onChange={(e) => {
                  setResolution(e.target.value);
                  setResolutionError(null);
                }}
                disabled={isLoading}
                maxLength={2000}
              />
              {resolutionError && (
                <p className="text-xs text-destructive mt-1">{resolutionError}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {resolution.length}/2000 characters
              </p>
            </div>
          )}

          {/* Progress indicator */}
          {isLoading && (
            <div className="bg-muted/50 rounded-md p-3">
              <div className="flex items-center gap-2 mb-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">
                  Processing... {progress.completed}/{progress.total}
                </span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-primary h-2 rounded-full transition-all"
                  style={{ width: `${(progress.completed / progress.total) * 100}%` }}
                />
              </div>
              {results.success > 0 && (
                <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {results.success} updated successfully
                </p>
              )}
              {results.failed > 0 && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {results.failed} failed
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading || !selectedStatusId || isLoadingStatuses || (requiresResolution && !resolution.trim())}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Updating...
              </>
            ) : (
              `Update ${selectedTicketIds.length} Ticket${selectedTicketIds.length > 1 ? 's' : ''}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
