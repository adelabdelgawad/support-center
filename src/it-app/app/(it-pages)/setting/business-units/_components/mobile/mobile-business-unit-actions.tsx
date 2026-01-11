"use client";

import { Button } from "@/components/ui/button";
import { Edit, Eye, Users } from "lucide-react";
import { useState } from "react";
import EditBusinessUnitSheet from "../modal/edit-business-unit-sheet";
import ViewBusinessUnitSheet from "../modal/view-business-unit-sheet";
import { ManageUsersSheet } from "../modal/manage-users-sheet";
import type { BusinessUnitResponse } from "@/types/business-units";
import type { BusinessUnitRegionResponse } from "@/types/business-unit-regions";

interface MobileBusinessUnitActionsProps {
  businessUnit: BusinessUnitResponse;
  regions: BusinessUnitRegionResponse[];
  onUpdate: () => void;
  onBusinessUnitUpdated?: (updatedUnit: BusinessUnitResponse) => void;
  disabled?: boolean;
}

/**
 * Mobile-optimized business unit actions with larger touch targets
 * View, Edit, and Manage Users buttons
 */
export function MobileBusinessUnitActions({
  businessUnit,
  regions,
  onUpdate,
  onBusinessUnitUpdated,
  disabled = false,
}: MobileBusinessUnitActionsProps) {
  const [viewingUnit, setViewingUnit] = useState<BusinessUnitResponse | null>(null);
  const [editingUnit, setEditingUnit] = useState<BusinessUnitResponse | null>(null);
  const [managingUsers, setManagingUsers] = useState<BusinessUnitResponse | null>(null);

  const handleViewUnit = () => {
    setViewingUnit(businessUnit);
  };

  const handleEditUnit = () => {
    setEditingUnit(businessUnit);
  };

  const handleManageUsers = () => {
    setManagingUsers(businessUnit);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {/* View Button - 44px min touch target */}
        <Button
          variant="outline"
          size="sm"
          className="min-h-[44px] min-w-[44px] px-3 flex-1"
          onClick={(e) => {
            e.stopPropagation();
            handleViewUnit();
          }}
          disabled={disabled}
        >
          <Eye className="h-5 w-5 mr-2" />
          View
        </Button>

        {/* Edit Button - 44px min touch target */}
        <Button
          variant="outline"
          size="sm"
          className="min-h-[44px] min-w-[44px] px-3 flex-1"
          onClick={(e) => {
            e.stopPropagation();
            handleEditUnit();
          }}
          disabled={disabled}
        >
          <Edit className="h-5 w-5 mr-2" />
          Edit
        </Button>

        {/* Manage Users Button - 44px min touch target */}
        <Button
          variant="outline"
          size="sm"
          className="min-h-[44px] min-w-[44px] px-3 flex-1"
          onClick={(e) => {
            e.stopPropagation();
            handleManageUsers();
          }}
          disabled={disabled}
        >
          <Users className="h-5 w-5 mr-2" />
          Users
        </Button>
      </div>

      {/* Sheets */}
      {viewingUnit && (
        <ViewBusinessUnitSheet
          unit={viewingUnit}
          regions={regions}
          onOpenChange={(open) => {
            if (!open) {
              setViewingUnit(null);
            }
          }}
        />
      )}

      {editingUnit && (
        <EditBusinessUnitSheet
          unit={editingUnit}
          regions={regions}
          onOpenChange={(open) => {
            if (!open) {
              setEditingUnit(null);
            }
          }}
        />
      )}

      {managingUsers && (
        <ManageUsersSheet
          open={true}
          businessUnit={managingUsers}
          onOpenChange={(open: boolean) => {
            if (!open) {
              setManagingUsers(null);
            }
          }}
          onSuccess={() => {
            onUpdate();
            setManagingUsers(null);
          }}
        />
      )}
    </>
  );
}
