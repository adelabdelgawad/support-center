"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MoreHorizontal, Eye, Pencil, Trash2, Users, Clock } from "lucide-react";
import type { BusinessUnitResponse } from "@/types/business-units";
import { EditBusinessUnitSheet } from "../modal";
import { ViewBusinessUnitSheet } from "../modal";
import { WorkingHoursSheet } from "../modal";
import { ManageUsersSheet } from "../modal";
import { useBusinessUnitsActions } from "../../context/business-units-actions-context";
import type { BusinessUnitRegionResponse } from "@/types/business-unit-regions";

interface BusinessUnitActionsProps {
  businessUnit: BusinessUnitResponse;
  regions: BusinessUnitRegionResponse[];
  onUpdate: () => void;
  onBusinessUnitUpdated?: (updatedUnit: BusinessUnitResponse) => void;
  disabled?: boolean;
}

export function BusinessUnitActions({
  businessUnit,
  regions,
  onUpdate,
  onBusinessUnitUpdated,
  disabled = false,
}: BusinessUnitActionsProps) {
  const [editingUnit, setEditingUnit] = useState<BusinessUnitResponse | null>(null);
  const [viewingUnit, setViewingUnit] = useState<BusinessUnitResponse | null>(null);
  const [workingHoursUnit, setWorkingHoursUnit] = useState<BusinessUnitResponse | null>(null);
  const [managingUsers, setManagingUsers] = useState<BusinessUnitResponse | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const { handleDelete } = useBusinessUnitsActions();

  const handleDeleteClick = async () => {
    if (deletingId !== null) {
      await handleDelete(deletingId);
      setDeletingId(null);
      onUpdate();
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" disabled={disabled}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setViewingUnit(businessUnit)}>
            <Eye className="mr-2 h-4 w-4" />
            View
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEditingUnit(businessUnit)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setWorkingHoursUnit(businessUnit)}>
            <Clock className="mr-2 h-4 w-4" />
            Working Hours
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setManagingUsers(businessUnit)}>
            <Users className="mr-2 h-4 w-4" />
            Manage Users
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-red-600"
            onClick={() => setDeletingId(businessUnit.id)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Modals */}
      {editingUnit && (
        <EditBusinessUnitSheet
          unit={editingUnit}
          regions={regions}
          onOpenChange={(open) => {
            if (!open) {
              setEditingUnit(null);
              onUpdate();
            }
          }}
        />
      )}

      {viewingUnit && (
        <ViewBusinessUnitSheet
          unit={viewingUnit}
          regions={regions}
          onOpenChange={(open) => !open && setViewingUnit(null)}
        />
      )}

      {workingHoursUnit && (
        <WorkingHoursSheet
          unit={workingHoursUnit}
          onOpenChange={(open) => !open && setWorkingHoursUnit(null)}
        />
      )}

      {managingUsers && (
        <ManageUsersSheet
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setManagingUsers(null);
            }
          }}
          businessUnit={managingUsers}
          onSuccess={() => {
            onUpdate();
            setManagingUsers(null);
          }}
        />
      )}

      <AlertDialog open={deletingId !== null} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete Business Unit</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete this business unit? This action cannot be undone.
          </AlertDialogDescription>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteClick} className="bg-red-600">
              Delete
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
