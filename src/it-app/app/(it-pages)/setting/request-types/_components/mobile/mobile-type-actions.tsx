"use client";

import { Button } from "@/components/ui/button";
import { Edit } from "lucide-react";
import { useState } from "react";
import EditTypeSheet from "../modal/edit-request-type-sheet";
import type { RequestType } from "@/types/request-types";

interface MobileTypeActionsProps {
  type: RequestType;
  onUpdate: () => void;
  onTypeUpdated?: (updatedType: RequestType) => void;
  disabled?: boolean;
}

/**
 * Mobile-optimized type actions with larger touch targets
 * View button removed - card click opens view sheet instead
 */
export function MobileTypeActions({
  type,
  onUpdate,
  onTypeUpdated,
  disabled = false,
}: MobileTypeActionsProps) {
  const [editingType, setEditingType] = useState<RequestType | null>(null);

  const handleEditType = () => {
    setEditingType(type);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Edit Type Button - 44px min touch target */}
        <Button
          variant="outline"
          size="sm"
          className="min-h-[44px] min-w-[44px] px-3 flex-1"
          onClick={(e) => {
            e.stopPropagation();
            handleEditType();
          }}
          disabled={disabled}
        >
          <Edit className="h-5 w-5 mr-2" />
          Edit
        </Button>
      </div>

      {/* Edit Sheet */}
      {editingType && (
        <EditTypeSheet
          type={editingType}
          onOpenChange={(open) => {
            if (!open) {
              setEditingType(null);
              onUpdate();
            }
          }}
        />
      )}
    </>
  );
}
