"use client";

import { Button } from "@/components/ui/button";
import { Edit, Eye, Building2 } from "lucide-react";
import { useState } from "react";
import EditRegionSheet from "../modal/edit-region-sheet";
import ViewRegionSheet from "../modal/view-region-sheet";
import { ManageBusinessUnitsSheet } from "../modal/manage-business-units-sheet";
import type { BusinessUnitRegionResponse } from "@/types/business-unit-regions";

interface MobileRegionActionsProps {
  region: BusinessUnitRegionResponse;
  onUpdate: () => void;
  onRegionUpdated?: (updatedRegion: BusinessUnitRegionResponse) => void;
  disabled?: boolean;
}

/**
 * Mobile-optimized region actions with larger touch targets
 * Includes View, Edit, and Manage Business Units buttons
 */
export function MobileRegionActions({
  region,
  onUpdate,
  onRegionUpdated,
  disabled = false,
}: MobileRegionActionsProps) {
  const [viewingRegion, setViewingRegion] = useState<BusinessUnitRegionResponse | null>(null);
  const [editingRegion, setEditingRegion] = useState<BusinessUnitRegionResponse | null>(null);
  const [managingBusinessUnits, setManagingBusinessUnits] = useState<BusinessUnitRegionResponse | null>(null);

  const handleViewRegion = () => {
    setViewingRegion(region);
  };

  const handleEditRegion = () => {
    setEditingRegion(region);
  };

  const handleManageBusinessUnits = () => {
    setManagingBusinessUnits(region);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {/* View Region Button - 44px min touch target */}
        <Button
          variant="outline"
          size="sm"
          className="min-h-[44px] min-w-[44px] px-3 flex-1"
          onClick={(e) => {
            e.stopPropagation();
            handleViewRegion();
          }}
          disabled={disabled}
        >
          <Eye className="h-5 w-5 mr-2" />
          View
        </Button>

        {/* Edit Region Button - 44px min touch target */}
        <Button
          variant="outline"
          size="sm"
          className="min-h-[44px] min-w-[44px] px-3 flex-1"
          onClick={(e) => {
            e.stopPropagation();
            handleEditRegion();
          }}
          disabled={disabled}
        >
          <Edit className="h-5 w-5 mr-2" />
          Edit
        </Button>

        {/* Manage Business Units Button - 44px min touch target */}
        <Button
          variant="outline"
          size="sm"
          className="min-h-[44px] min-w-[44px] px-3 flex-1"
          onClick={(e) => {
            e.stopPropagation();
            handleManageBusinessUnits();
          }}
          disabled={disabled}
        >
          <Building2 className="h-5 w-5 mr-2" />
          Units
        </Button>
      </div>

      {/* Sheets */}
      {viewingRegion && (
        <ViewRegionSheet
          region={viewingRegion}
          onOpenChange={(open) => {
            if (!open) {
              setViewingRegion(null);
            }
          }}
        />
      )}

      {editingRegion && (
        <EditRegionSheet
          region={editingRegion}
          onOpenChange={(open) => {
            if (!open) {
              setEditingRegion(null);
            }
          }}
        />
      )}

      {managingBusinessUnits && (
        <ManageBusinessUnitsSheet
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setManagingBusinessUnits(null);
            }
          }}
          region={managingBusinessUnits}
          onSuccess={() => {
            onUpdate();
            setManagingBusinessUnits(null);
          }}
        />
      )}
    </>
  );
}
