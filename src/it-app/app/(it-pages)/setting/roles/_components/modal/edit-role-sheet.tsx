'use client';

import { useMemo } from 'react';
import { z } from 'zod';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { EntityFormSheet } from '@/components/settings';
import { updateRole } from '@/lib/api/roles';
import { useRolesActions } from '@/app/(it-pages)/setting/roles/context/roles-actions-context';
import { Edit } from 'lucide-react';
import type { RoleResponse, RoleUpdateRequest } from '@/types/roles';

const roleSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  description: z.string().max(500, 'Description must be 500 characters or less').optional().nullable(),
});

type RoleFormData = z.infer<typeof roleSchema>;

interface EditRoleSheetProps {
  role: RoleResponse;
  onOpenChange?: (open: boolean) => void;
}

export function EditRoleSheet({
  role,
  onOpenChange,
}: EditRoleSheetProps) {
  const { handleUpdateRole } = useRolesActions();

  const handleSubmit = async (data: RoleFormData) => {
    const updateData: RoleUpdateRequest = {
      name: data.name !== role.name ? data.name : null,
      description: data.description !== role.description ? (data.description || null) : null,
    };

    const updatedRole = await updateRole(role.id, updateData);
    handleUpdateRole(role.id, updatedRole);
  };

  const defaultValues: RoleFormData = useMemo(() => ({
    name: role.name,
    description: role.description ?? null,
  }), [role]);

  return (
    <EntityFormSheet<RoleFormData>
      open={true}
      onOpenChange={onOpenChange ?? (() => {})}
      mode="edit"
      title="Role"
      description={`Update details for "${role.name}".`}
      icon={Edit}
      schema={roleSchema}
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
                  Name <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <Input {...field} placeholder="e.g., Administrator" />
                </FormControl>
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
                    placeholder="Optional description"
                    rows={3}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </>
      )}
    </EntityFormSheet>
  );
}

export default EditRoleSheet;
