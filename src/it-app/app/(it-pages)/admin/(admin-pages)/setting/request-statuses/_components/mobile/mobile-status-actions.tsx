"use client";

import { Button } from "@/components/ui/button";
import { Edit } from "lucide-react";
import { useState } from "react";
import { EditRequestStatusSheet } from "../modal";
import type { RequestStatusResponse } from "@/types/request-statuses";

interface MobileStatusActionsProps {
  status: RequestStatusResponse;
  onUpdate: () => void;
  onStatusUpdated?: (updatedStatus: RequestStatusResponse) => void;
  disabled?: boolean;
}

/**
 * Mobile-optimized status actions with larger touch targets
 * View button removed - card click opens view sheet instead
 * Edit button disabled for readonly statuses
 */
export function MobileStatusActions({
  status,
  onUpdate,
  onStatusUpdated,
  disabled = false,
}: MobileStatusActionsProps) {
  const [editingStatus, setEditingStatus] = useState<RequestStatusResponse | null>(null);

  const handleEditStatus = () => {
    if (!status.readonly) {
      setEditingStatus(status);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Edit Status Button - 44px min touch target, disabled for readonly */}
        <Button
          variant="outline"
          size="sm"
          className="min-h-[44px] min-w-[44px] px-3 flex-1"
          onClick={(e) => {
            e.stopPropagation();
            handleEditStatus();
          }}
          disabled={disabled || status.readonly}
        >
          <Edit className="h-5 w-5 mr-2" />
          {status.readonly ? "System Status" : "Edit"}
        </Button>
      </div>

      {/* Edit Sheet */}
      {editingStatus && (
        <EditRequestStatusSheet
          status={editingStatus}
          onOpenChange={(open) => {
            if (!open) {
              setEditingStatus(null);
              onUpdate();
            }
          }}
        />
      )}
    </>
  );
}
