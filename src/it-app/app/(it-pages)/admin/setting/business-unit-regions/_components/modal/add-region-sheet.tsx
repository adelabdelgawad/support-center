'use client';

import { z } from 'zod';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { EntityFormSheet } from '@/components/settings';
import { createBusinessUnitRegion } from '@/lib/api/business-unit-regions';
import { useRegionsActions } from '../../context/regions-actions-context';
import { MapPin } from 'lucide-react';
import type { BusinessUnitRegionCreate } from '@/types/business-unit-regions';

const regionSchema = z.object({
  name: z.string().min(1, 'Region name is required').max(100, 'Name must be 100 characters or less'),
  description: z.string().max(500, 'Description must be 500 characters or less').optional().nullable(),
});

type RegionFormData = z.infer<typeof regionSchema>;

interface AddRegionSheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AddRegionSheet({
  open = true,
  onOpenChange
}: AddRegionSheetProps) {
  const { addRegionToCache } = useRegionsActions();

  const handleSubmit = async (data: RegionFormData) => {
    const createData: BusinessUnitRegionCreate = {
      name: data.name,
      description: data.description || null,
    };

    const newRegion = await createBusinessUnitRegion(createData);
    await addRegionToCache(newRegion);
  };

  const defaultValues: RegionFormData = {
    name: '',
    description: null,
  };

  return (
    <EntityFormSheet<RegionFormData>
      open={open}
      onOpenChange={onOpenChange ?? (() => {})}
      mode="add"
      title="Business Unit Region"
      description="Create a new geographic region for business unit organization."
      icon={MapPin}
      schema={regionSchema}
      defaultValues={defaultValues}
      onSubmit={handleSubmit}
      size="md"
    >
      {(form) => (
        <>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Region Name <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Input {...field} placeholder="e.g., Asia Pacific, Europe, North America" />
                </FormControl>
                <FormDescription>
                  Enter a unique name for this business unit region
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    value={field.value ?? ''}
                    placeholder="Provide additional details about this region (optional)"
                    rows={4}
                  />
                </FormControl>
                <FormDescription>
                  Optional description to provide more context about this region
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </>
      )}
    </EntityFormSheet>
  );
}

export default AddRegionSheet;
