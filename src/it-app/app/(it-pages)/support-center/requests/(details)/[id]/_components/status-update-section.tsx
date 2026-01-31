"use client";

/**
 * Status Update Section Component
 *
 * Features:
 * - Prominent status badge display showing current status
 * - Dropdown for authorized users to change status
 * - Confirmation dialog before status change
 * - Resolution input for statuses 6 (Resolved) and 8 (Closed)
 * - Real-time updates via WebSocket
 */

import { useState, useCallback, useMemo, useEffect, startTransition } from 'react';
import { Loader2, ChevronDown, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useRequestDetail } from '../_context/request-detail-context';
import { toast } from '@/components/ui/custom-toast';

// Status IDs that require resolution text
// ID 3: Solved (requires resolution)
// ID 5: Canceled (requires cancellation reason)
const RESOLUTION_REQUIRED_STATUS_IDS = [3, 5];

export function StatusUpdateSection() {
  const {
    ticket,
    statuses,
    canEditRequestDetails,  // Restricted to assignees, Senior, Supervisor, Admin
    updateTicketStatus,
    isUpdatingStatus,
    updatingTicket,
  } = useRequestDetail();

  // Hydration fix: Defer conditional rendering until after client mount
  // This ensures server and client render the same initial content
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    startTransition(() => {
      setIsMounted(true);
    });
  }, []);

  // State for status change
  const [selectedStatusId, setSelectedStatusId] = useState<string | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [resolution, setResolution] = useState('');
  const [resolutionError, setResolutionError] = useState<string | null>(null);

  // Get current status info
  const currentStatus = ticket.status;

  // Check if current status is count_as_solved (should disable menu)
  const isStatusSolved = currentStatus?.countAsSolved === true;

  // Get status by ID for display
  const getStatusById = useCallback((statusId: number) => {
    // Safety check: ensure statuses is an array
    if (!Array.isArray(statuses)) {
      return { id: statusId, name: 'Unknown', color: null };
    }
    return statuses.find(s => s.id === statusId) || { id: statusId, name: 'Unknown', color: null };
  }, [statuses]);

  // Check if selected status requires resolution
  const selectedStatusRequiresResolution = useMemo(() => {
    if (!selectedStatusId) return false;
    return RESOLUTION_REQUIRED_STATUS_IDS.includes(parseInt(selectedStatusId, 10));
  }, [selectedStatusId]);

  // Get the label for resolution field based on status
  const resolutionLabel = useMemo(() => {
    if (!selectedStatusId) return 'Resolution';
    const statusId = parseInt(selectedStatusId, 10);
    if (statusId === 3) return 'Resolution';
    if (statusId === 5) return 'Cancellation Reason';
    return 'Resolution';
  }, [selectedStatusId]);

  // Get the placeholder for resolution field based on status
  const resolutionPlaceholder = useMemo(() => {
    if (!selectedStatusId) return 'Enter details...';
    const statusId = parseInt(selectedStatusId, 10);
    if (statusId === 3) return 'Enter resolution details (how was the issue resolved)...';
    if (statusId === 5) return 'Enter cancellation reason (why was this request canceled)...';
    return 'Enter details...';
  }, [selectedStatusId]);

  // Check if the confirm button should be disabled
  const isConfirmDisabled = useMemo(() => {
    if (isUpdatingStatus) return true;
    if (selectedStatusRequiresResolution && !resolution.trim()) return true;
    return false;
  }, [isUpdatingStatus, selectedStatusRequiresResolution, resolution]);

  // Handle status selection - show confirmation dialog
  const handleStatusSelect = useCallback((newStatusId: string) => {
    // Don't show dialog if same status selected
    if (parseInt(newStatusId, 10) === currentStatus?.id) return;

    setSelectedStatusId(newStatusId);
    setResolution('');
    setResolutionError(null);
    setShowConfirmDialog(true);
  }, [currentStatus?.id]);

  // Handle confirmation - apply status change
  const handleConfirmStatusChange = useCallback(async () => {
    if (!selectedStatusId || isUpdatingStatus || updatingTicket) return;

    const newStatusId = parseInt(selectedStatusId, 10);

    // Validate resolution if required
    if (RESOLUTION_REQUIRED_STATUS_IDS.includes(newStatusId)) {
      if (!resolution.trim()) {
        const fieldName = newStatusId === 3 ? 'Resolution' : 'Cancellation reason';
        setResolutionError(`${fieldName} is required for this status`);
        return;
      }
      if (resolution.length > 2000) {
        const fieldName = newStatusId === 3 ? 'Resolution' : 'Cancellation reason';
        setResolutionError(`${fieldName} must not exceed 2000 characters`);
        return;
      }
    }

    try {
      const resolutionText = RESOLUTION_REQUIRED_STATUS_IDS.includes(newStatusId)
        ? resolution.trim()
        : undefined;

      await updateTicketStatus(newStatusId, resolutionText);

      const newStatus = getStatusById(newStatusId);
      toast.success(`Status changed to ${newStatus.name}`);

      // Reset state
      setShowConfirmDialog(false);
      setSelectedStatusId(null);
      setResolution('');
      setResolutionError(null);
    } catch (error) {
      console.error('Failed to update status:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update status');
    }
  }, [selectedStatusId, isUpdatingStatus, updatingTicket, resolution, updateTicketStatus, getStatusById]);

  // Handle cancel
  const handleCancelStatusChange = useCallback(() => {
    setShowConfirmDialog(false);
    setSelectedStatusId(null);
    setResolution('');
    setResolutionError(null);
  }, []);

  // Get status name for display in dialog
  const getSelectedStatusName = useCallback(() => {
    if (!selectedStatusId) return '';
    return getStatusById(parseInt(selectedStatusId, 10)).name;
  }, [selectedStatusId, getStatusById]);

  return (
    <div className="mb-4">
      <Label className="text-sm text-muted-foreground font-medium">Status</Label>

      {/* If user can edit request details, show dropdown */}
      {/* HYDRATION FIX: Only show Select after mount to avoid server/client mismatch */}
      {/* canEditRequestDetails depends on client-side session which differs from server */}
      {isMounted && canEditRequestDetails ? (
        <Select
          key={`status-${currentStatus?.id}`}
          value={currentStatus?.id?.toString() || ''}
          onValueChange={handleStatusSelect}
          disabled={isUpdatingStatus || updatingTicket || isStatusSolved}
        >
          <SelectTrigger className="w-full mt-1">
            {isUpdatingStatus ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Updating...</span>
              </div>
            ) : isStatusSolved ? (
              <div className="flex items-center gap-2">
                <span className="font-medium text-muted-foreground">
                  {currentStatus?.name || 'Unknown'}
                </span>
                <span className="text-xs text-muted-foreground">(Solved - No updates allowed)</span>
              </div>
            ) : (
              <SelectValue placeholder="Select status">
                <span className="font-medium">
                  {currentStatus?.name || 'Unknown'}
                </span>
              </SelectValue>
            )}
          </SelectTrigger>
          <SelectContent>
            {statuses.length > 0 ? (
              statuses
                .filter((status) => status.id !== 1) // Exclude "Open" status (ID 1) from selection
                .map((status) => {
                  return (
                    <SelectItem key={status.id} value={status.id.toString()}>
                      {status.name}
                    </SelectItem>
                  );
                })
            ) : (
              <SelectItem value="loading" disabled>
                Loading statuses...
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      ) : (
        /* If user cannot update status, show text only */
        <div className="mt-2">
          <span className="font-medium text-sm">
            {currentStatus?.name || 'Unknown'}
          </span>
        </div>
      )}

      {/* Status Change Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={(open) => !open && handleCancelStatusChange()}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Change Status</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to change the status from{' '}
              <span className="font-semibold text-foreground">{currentStatus?.name}</span>{' '}
              to{' '}
              <span className="font-semibold text-foreground">{getSelectedStatusName()}</span>?
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* Resolution Input for statuses 3 (Solved) and 5 (Canceled) */}
          {selectedStatusRequiresResolution && (
            <div className="my-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <Label className="text-sm font-medium">
                  {resolutionLabel} <span className="text-destructive">*</span>
                </Label>
              </div>
              <Textarea
                className="w-full"
                rows={4}
                placeholder={resolutionPlaceholder}
                value={resolution}
                onChange={(e) => {
                  setResolution(e.target.value);
                  setResolutionError(null);
                }}
                disabled={isUpdatingStatus}
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

          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdatingStatus}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmStatusChange}
              disabled={isConfirmDisabled}
            >
              {isUpdatingStatus ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Updating...
                </>
              ) : (
                'Confirm'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
