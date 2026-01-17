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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { Building2, MapPin, Network, FileText, Loader2, Save, MessageSquare } from 'lucide-react';
import { UnsavedChangesWarning } from '@/components/ui/unsaved-changes-warning';
import { updateBusinessUnit } from '@/lib/api/business-units';
import { useBusinessUnitsActions } from '../../context/business-units-actions-context';
import { toast } from 'sonner';
import type { BusinessUnitResponse, BusinessUnitUpdate } from '@/types/business-units';
import type { BusinessUnitRegionResponse } from '@/types/business-unit-regions';

interface EditBusinessUnitSheetProps {
  unit: BusinessUnitResponse;
  regions: BusinessUnitRegionResponse[];
  onOpenChange?: (open: boolean) => void;
}

export function EditBusinessUnitSheet({
  unit,
  regions,
  onOpenChange,
}: EditBusinessUnitSheetProps) {
  const { updateBusinessUnitsOptimistic } = useBusinessUnitsActions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [formData, setFormData] = useState<BusinessUnitUpdate>({
    name: unit.name,
    description: unit.description,
    network: unit.network,
    businessUnitRegionId: unit.businessUnitRegionId,
    whatsappGroupName: unit.whatsappGroupName,
    whatsappGroupId: unit.whatsappGroupId,
    whatsappOutshiftIntervalMinutes: unit.whatsappOutshiftIntervalMinutes || 30,
  });

  const hasChanges =
    formData.name !== unit.name ||
    formData.description !== unit.description ||
    formData.network !== unit.network ||
    formData.businessUnitRegionId !== unit.businessUnitRegionId ||
    formData.whatsappGroupName !== unit.whatsappGroupName ||
    formData.whatsappGroupId !== unit.whatsappGroupId ||
    formData.whatsappOutshiftIntervalMinutes !== unit.whatsappOutshiftIntervalMinutes;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name?.trim()) {
      toast.error('Name is required');
      return;
    }

    if (!formData.businessUnitRegionId) {
      toast.error('Region is required');
      return;
    }

    if (formData.whatsappOutshiftIntervalMinutes && formData.whatsappOutshiftIntervalMinutes < 5) {
      toast.error('WhatsApp interval must be at least 5 minutes');
      return;
    }

    setShowConfirmDialog(true);
  };

  const handleConfirmUpdate = async () => {
    setShowConfirmDialog(false);
    setIsSubmitting(true);
    try {
      const updatedUnit = await updateBusinessUnit(unit.id, formData);
      await updateBusinessUnitsOptimistic([updatedUnit]);
      toast.success('Business unit updated successfully');
      onOpenChange?.(false);
    } catch (error) {
      toast.error('Failed to update business unit');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={true} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[480px]">
        <SheetHeader className="px-1">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <SheetTitle>Edit Business Unit</SheetTitle>
              <SheetDescription>Update the business unit details</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1">
          <ScrollArea className="h-[calc(100vh-280px)] px-1">
            <div className="space-y-6 pr-4">
              {/* Name Field */}
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  Business Unit Name *
                </Label>
                <Input
                  id="name"
                  placeholder="e.g., North America Division"
                  value={formData.name || ''}
                  onChange={(e) => {
                    setFormData({ ...formData, name: e.target.value });
                    setIsDirty(true);
                  }}
                  disabled={isSubmitting}
                  className="h-10"
                />
                <p className="text-xs text-muted-foreground">Enter a unique name for this business unit</p>
              </div>

              {/* Region Field */}
              <div className="space-y-2">
                <Label htmlFor="region" className="text-sm font-medium flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  Region *
                </Label>
                <Select
                  value={formData.businessUnitRegionId?.toString() || ''}
                  onValueChange={(value) => {
                    setFormData({ ...formData, businessUnitRegionId: parseInt(value) });
                    setIsDirty(true);
                  }}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="region" className="h-11 w-full p-2">
                    <SelectValue placeholder="Select a region" />
                  </SelectTrigger>
                  <SelectContent>
                    {regions.map((region) => (
                      <SelectItem key={region.id} value={region.id.toString()}>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          {region.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Select the geographical region</p>
              </div>

              {/* Network Field */}
              <div className="space-y-2">
                <Label htmlFor="network" className="text-sm font-medium flex items-center gap-2">
                  <Network className="h-4 w-4 text-muted-foreground" />
                  Network (CIDR)
                </Label>
                <Input
                  id="network"
                  placeholder="e.g., 10.23.0.0/16"
                  value={formData.network || ''}
                  onChange={(e) => {
                    setFormData({ ...formData, network: e.target.value || null });
                    setIsDirty(true);
                  }}
                  disabled={isSubmitting}
                  className="h-10 font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">Optional network address in CIDR notation</p>
              </div>

              {/* Description Field */}
              <div className="space-y-2">
                <Label htmlFor="description" className="text-sm font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Description
                </Label>
                <Textarea
                  id="description"
                  placeholder="Brief description of this business unit..."
                  value={formData.description || ''}
                  onChange={(e) => {
                    setFormData({ ...formData, description: e.target.value || null });
                    setIsDirty(true);
                  }}
                  disabled={isSubmitting}
                  rows={4}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">Optional additional information</p>
              </div>

              {/* WhatsApp Configuration Section */}
              <div className="space-y-4 border-t pt-6">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-base">WhatsApp Out-of-Shift Escalation</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Configure WhatsApp group for out-of-shift notifications.
                </p>

                {/* WhatsApp Group Name */}
                <div className="space-y-2">
                  <Label htmlFor="whatsappGroupName" className="text-sm font-medium flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    WhatsApp Group Name
                  </Label>
                  <Input
                    id="whatsappGroupName"
                    placeholder="e.g., IT Support Team"
                    value={formData.whatsappGroupName || ''}
                    onChange={(e) => {
                      setFormData({ ...formData, whatsappGroupName: e.target.value || null });
                      setIsDirty(true);
                    }}
                    disabled={isSubmitting}
                    className="h-10"
                  />
                  <p className="text-xs text-muted-foreground">Name of the WhatsApp group for escalation</p>
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
                    value={formData.whatsappGroupId || ''}
                    onChange={(e) => {
                      setFormData({ ...formData, whatsappGroupId: e.target.value || null });
                      setIsDirty(true);
                    }}
                    disabled={isSubmitting}
                    className="h-10 font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">WhatsApp group ID or identifier</p>
                </div>

                {/* Interval Minutes */}
                <div className="space-y-2">
                  <Label htmlFor="intervalMinutes" className="text-sm font-medium flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-muted-foreground" />
                    Periodic Send Interval (minutes)
                  </Label>
                  <Input
                    id="intervalMinutes"
                    type="number"
                    min="5"
                    step="1"
                    placeholder="30"
                    value={formData.whatsappOutshiftIntervalMinutes || ''}
                    onChange={(e) => {
                      setFormData({ ...formData, whatsappOutshiftIntervalMinutes: parseInt(e.target.value) || 30 });
                      setIsDirty(true);
                    }}
                    disabled={isSubmitting}
                    className="h-10"
                  />
                  <p className="text-xs text-muted-foreground">
                    How often to send periodic WhatsApp updates for unassigned requests (minimum 5 minutes)
                  </p>
                </div>
              </div>

              <UnsavedChangesWarning show={hasChanges} />
            </div>
          </ScrollArea>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end pt-4 border-t px-1">
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
      </SheetContent>

      <ConfirmationDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        title="Update Business Unit"
        description={`Are you sure you want to save changes to "${formData.name}"?`}
        confirmText="Save Changes"
        cancelText="Cancel"
        onConfirm={handleConfirmUpdate}
        variant="default"
      />
    </Sheet>
  );
}

export default EditBusinessUnitSheet;
