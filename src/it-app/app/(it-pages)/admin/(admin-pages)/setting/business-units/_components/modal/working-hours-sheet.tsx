'use client';

import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { WorkingHoursEditor } from '@/components/ui/working-hours-editor';
import { Clock, Loader2, Save, MessageSquare, Network } from 'lucide-react';
import { UnsavedChangesWarning } from '@/components/ui/unsaved-changes-warning';
import { updateBusinessUnit } from '@/lib/api/business-units';
import { useBusinessUnitsActions } from '../../context/business-units-actions-context';
import { toast } from 'sonner';
import type { BusinessUnitResponse, WorkingHours } from '@/types/business-units';

interface WorkingHoursSheetProps {
  unit: BusinessUnitResponse;
  onOpenChange?: (open: boolean) => void;
}

export function WorkingHoursSheet({
  unit,
  onOpenChange,
}: WorkingHoursSheetProps) {
  const { updateBusinessUnitsOptimistic } = useBusinessUnitsActions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [workingHours, setWorkingHours] = useState<WorkingHours | null>(
    unit.workingHours || null
  );
  const [whatsappGroupName, setWhatsappGroupName] = useState<string>(
    unit.whatsappGroupName || ''
  );
  const [whatsappGroupId, setWhatsappGroupId] = useState<string>(
    unit.whatsappGroupId || ''
  );
  const [whatsappInterval, setWhatsappInterval] = useState<number>(
    unit.whatsappOutshiftIntervalMinutes || 30
  );

  const hasChanges =
    JSON.stringify(workingHours) !== JSON.stringify(unit.workingHours) ||
    whatsappGroupName !== (unit.whatsappGroupName || '') ||
    whatsappGroupId !== (unit.whatsappGroupId || '') ||
    whatsappInterval !== (unit.whatsappOutshiftIntervalMinutes || 30);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate WhatsApp interval
    if (whatsappInterval && whatsappInterval < 5) {
      toast.error('WhatsApp interval must be at least 5 minutes');
      return;
    }

    // No validation needed for WhatsApp group ID as it's a free-form identifier

    setShowConfirmDialog(true);
  };

  const handleConfirmUpdate = async () => {
    setShowConfirmDialog(false);
    setIsSubmitting(true);
    try {
      const updatedUnit = await updateBusinessUnit(unit.id, {
        workingHours,
        whatsappGroupName: whatsappGroupName || null,
        whatsappGroupId: whatsappGroupId || null,
        whatsappOutshiftIntervalMinutes: whatsappInterval,
      });
      await updateBusinessUnitsOptimistic([updatedUnit]);
      toast.success('Working hours and WhatsApp configuration updated successfully');
      onOpenChange?.(false);
    } catch (error) {
      toast.error('Failed to update configuration');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[480px] flex flex-col p-0">
        {/* Fixed Header */}
        <SheetHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <SheetTitle>Configure Working Hours</SheetTitle>
              <SheetDescription>{unit.name}</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          <form onSubmit={handleSubmit} className="space-y-6 p-6">
          {/* Working Hours Section */}
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Configure working hours for out-of-shift WhatsApp escalation. Messages received outside these hours will be escalated.
            </p>
            <WorkingHoursEditor
              value={workingHours}
              onChange={(hours) => setWorkingHours(hours)}
              disabled={isSubmitting}
            />
          </div>

          {/* WhatsApp Configuration Section */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-base">WhatsApp Out-of-Shift Escalation</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Configure WhatsApp group for automatic escalation of messages received outside working hours.
                </p>

                {/* WhatsApp Group Name */}
                <div className="space-y-2">
                  <Label htmlFor="whatsappGroupName" className="text-sm font-medium">
                    WhatsApp Group Name
                  </Label>
                  <Input
                    id="whatsappGroupName"
                    placeholder="e.g., IT Support Team"
                    value={whatsappGroupName}
                    onChange={(e) => setWhatsappGroupName(e.target.value)}
                    disabled={isSubmitting}
                    className="h-10"
                  />
                  <p className="text-xs text-muted-foreground">
                    Name of the WhatsApp group for escalation notifications
                  </p>
                </div>

                {/* WhatsApp Group ID */}
                <div className="space-y-2">
                  <Label htmlFor="whatsappGroupId" className="text-sm font-medium flex items-center gap-2">
                    <Network className="h-4 w-4 text-muted-foreground" />
                    WhatsApp Group ID
                  </Label>
                  <Input
                    id="whatsappGroupId"
                    type="text"
                    placeholder="e.g., 120363123456789012@g.us"
                    value={whatsappGroupId}
                    onChange={(e) => setWhatsappGroupId(e.target.value)}
                    disabled={isSubmitting}
                    className="h-10 font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    WhatsApp group ID for out-of-shift notifications
                  </p>
                </div>

                {/* Interval Minutes */}
                <div className="space-y-2">
                  <Label htmlFor="intervalMinutes" className="text-sm font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    Periodic Send Interval (minutes)
                  </Label>
                  <Input
                    id="intervalMinutes"
                    type="number"
                    min="5"
                    step="1"
                    placeholder="30"
                    value={whatsappInterval}
                    onChange={(e) => setWhatsappInterval(parseInt(e.target.value) || 30)}
                    disabled={isSubmitting}
                    className="h-10"
                  />
                  <p className="text-xs text-muted-foreground">
                    How often to send periodic WhatsApp updates for unassigned out-of-shift requests (minimum 5 minutes)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <UnsavedChangesWarning show={hasChanges} />

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end pt-4 border-t sticky bottom-0 bg-background pb-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange?.(false)}
              disabled={isSubmitting}
              className="min-w-[100px]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !hasChanges}
              className="min-w-[120px]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
          </form>
        </div>
      </SheetContent>

      <ConfirmationDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        title="Update Configuration"
        description={`Are you sure you want to save working hours and WhatsApp configuration for "${unit.name}"?`}
        confirmText="Save Changes"
        cancelText="Cancel"
        onConfirm={handleConfirmUpdate}
        variant="default"
      />
    </Sheet>
  );
}

export default WorkingHoursSheet;
