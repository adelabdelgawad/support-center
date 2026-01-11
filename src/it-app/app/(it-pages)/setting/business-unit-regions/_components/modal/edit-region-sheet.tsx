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
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { MapPin, FileText, Loader2 } from 'lucide-react';
import { UnsavedChangesWarning } from '@/components/ui/unsaved-changes-warning';
import { updateBusinessUnitRegion } from '@/lib/api/business-unit-regions';
import { useRegionsActions } from '../../context/regions-actions-context';
import { toast } from 'sonner';
import type { BusinessUnitRegionResponse, BusinessUnitRegionUpdate } from '@/types/business-unit-regions';

interface EditRegionSheetProps {
  region: BusinessUnitRegionResponse;
  onOpenChange?: (open: boolean) => void;
}

export default function EditRegionSheet({ region, onOpenChange }: EditRegionSheetProps) {
  const { updateRegionsOptimistic } = useRegionsActions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [formData, setFormData] = useState<BusinessUnitRegionUpdate>({
    name: region.name,
    description: region.description,
  });

  const hasChanges =
    formData.name !== region.name || formData.description !== region.description;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name?.trim()) {
      toast.error('Name is required');
      return;
    }

    setShowConfirmDialog(true);
  };

  const handleConfirmUpdate = async () => {
    setShowConfirmDialog(false);
    setIsSubmitting(true);
    try {
      const updatedRegion = await updateBusinessUnitRegion(region.id, formData);
      await updateRegionsOptimistic([updatedRegion]);
      toast.success('Region updated successfully');
      onOpenChange?.(false);
    } catch (error) {
      toast.error('Failed to update region');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Sheet open={true} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-[480px]">
          <SheetHeader className="px-1">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <MapPin className="h-5 w-5 text-primary" />
              </div>
              <div>
                <SheetTitle>Edit Business Unit Region</SheetTitle>
                <SheetDescription>Update the business unit region details</SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="space-y-6 pt-6 px-1">
            <UnsavedChangesWarning show={hasChanges} />

            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                Region Name *
              </Label>
              <Input
                id="name"
                placeholder="e.g., Asia Pacific, Europe, North America"
                value={formData.name || ''}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                disabled={isSubmitting}
                className="h-10"
              />
              <p className="text-xs text-muted-foreground">
                Enter a unique name for this business unit region
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Description
              </Label>
              <Textarea
                id="description"
                placeholder="Provide additional details about this region (optional)"
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value || null })}
                disabled={isSubmitting}
                rows={4}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Optional description to provide more context about this region
              </p>
            </div>

            <div className="flex gap-2 justify-end pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange?.(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || !hasChanges}>
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
          </form>
        </SheetContent>
      </Sheet>

      <ConfirmationDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        title="Update Business Unit Region"
        description={`Are you sure you want to update the business unit region "${region.name}"?`}
        onConfirm={handleConfirmUpdate}
      />
    </>
  );
}
