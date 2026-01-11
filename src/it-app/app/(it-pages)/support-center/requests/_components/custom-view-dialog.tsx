'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { UserCustomView, AvailableTabId } from '@/types/custom-views';
import {
  fetchMyCustomView,
  updateMyCustomView,
  resetMyCustomView,
  fetchAvailableTabs,
} from '@/lib/api/custom-views';

interface CustomViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

// Tab display names
const TAB_LABELS: Record<AvailableTabId, string> = {
  unassigned: 'Unassigned',
  all_unsolved: 'All Unsolved',
  my_unsolved: 'My Unsolved',
  recently_updated: 'Recently Updated',
  recently_solved: 'Recently Solved',
  all_your_requests: 'All Your Requests',
  urgent_high_priority: 'Urgent & High Priority',
  pending_requester_response: 'Pending Requester Response',
  pending_subtask: 'Pending Subtask',
  new_today: 'New Today',
  in_progress: 'In Progress',
};

export function CustomViewDialog({
  open,
  onOpenChange,
  onSuccess,
}: CustomViewDialogProps) {
  const [availableTabs, setAvailableTabs] = useState<AvailableTabId[]>([]);
  const [visibleTabs, setVisibleTabs] = useState<AvailableTabId[]>([]);
  const [defaultTab, setDefaultTab] = useState<AvailableTabId>('unassigned');

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load current view and available tabs when dialog opens
  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [view, tabs] = await Promise.all([
        fetchMyCustomView(),
        fetchAvailableTabs(),
      ]);

      setAvailableTabs(tabs as AvailableTabId[]);
      setVisibleTabs(view.visibleTabs);
      setDefaultTab(view.defaultTab);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load view settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleTab = (tabId: AvailableTabId) => {
    setVisibleTabs((prev) =>
      prev.includes(tabId)
        ? prev.filter((id) => id !== tabId)
        : [...prev, tabId]
    );
  };

  const handleSubmit = async () => {
    if (visibleTabs.length === 0) {
      setError('At least one tab must be visible');
      return;
    }

    if (!visibleTabs.includes(defaultTab)) {
      setError('Default tab must be one of the visible tabs');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await updateMyCustomView({
        visibleTabs,
        defaultTab,
      });

      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save view settings');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = async () => {
    setIsResetting(true);
    setError(null);

    try {
      const view = await resetMyCustomView();
      setVisibleTabs(view.visibleTabs);
      setDefaultTab(view.defaultTab);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset view');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Customize Your View</DialogTitle>
          <DialogDescription>
            Choose which tabs to show and set your default tab
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-6 py-4">
            {/* Visible Tabs */}
            <div className="grid gap-3">
              <Label>Visible Tabs</Label>
              <div className="grid gap-2 max-h-60 overflow-y-auto border rounded-md p-3">
                {availableTabs.map((tabId) => (
                  <div key={tabId} className="flex items-center space-x-2">
                    <Checkbox
                      id={tabId}
                      checked={visibleTabs.includes(tabId)}
                      onCheckedChange={() => handleToggleTab(tabId)}
                    />
                    <label htmlFor={tabId} className="text-sm cursor-pointer">
                      {TAB_LABELS[tabId]}
                    </label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Select at least one tab to display
              </p>
            </div>

            {/* Default Tab */}
            <div className="grid gap-2">
              <Label htmlFor="defaultTab">Default Tab</Label>
              <Select value={defaultTab} onValueChange={(value) => setDefaultTab(value as AvailableTabId)}>
                <SelectTrigger id="defaultTab">
                  <SelectValue placeholder="Select default tab" />
                </SelectTrigger>
                <SelectContent>
                  {visibleTabs.map((tabId) => (
                    <SelectItem key={tabId} value={tabId}>
                      {TAB_LABELS[tabId]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                This tab will open by default when you visit the tickets page
              </p>
            </div>

            {/* Error */}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter className="flex justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={isSubmitting || isResetting || isLoading}
          >
            {isResetting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Resetting...
              </>
            ) : (
              'Reset to Defaults'
            )}
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting || isLoading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || isLoading}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
