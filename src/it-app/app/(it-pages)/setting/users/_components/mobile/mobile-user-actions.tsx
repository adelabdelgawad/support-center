"use client";

import { Button } from "@/components/ui/button";
import { Edit, Building2 } from "lucide-react";
import { useState } from "react";
import { EditUserSheet } from "../modal/edit-user-sheet";
import { AssignBusinessUnitsSheet } from "../modal/assign-business-units-sheet";
import type { UserWithRolesResponse } from "@/types/users";

interface MobileUserActionsProps {
  user: UserWithRolesResponse;
  onUpdate: () => void;
  onUserUpdated?: (updatedUser: UserWithRolesResponse) => void;
  disabled?: boolean;
}

/**
 * Mobile-optimized user actions with larger touch targets
 * View button removed - card click opens view sheet instead
 */
export function MobileUserActions({
  user,
  onUpdate,
  onUserUpdated,
  disabled = false,
}: MobileUserActionsProps) {
  const [editingUser, setEditingUser] = useState<UserWithRolesResponse | null>(null);
  const [assigningBusinessUnits, setAssigningBusinessUnits] = useState<UserWithRolesResponse | null>(null);

  const handleEditUser = () => {
    setEditingUser(user);
  };

  const handleAssignBusinessUnits = () => {
    setAssigningBusinessUnits(user);
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Edit User Button - 44px min touch target */}
        <Button
          variant="outline"
          size="sm"
          className="min-h-[44px] min-w-[44px] px-3 flex-1"
          onClick={(e) => {
            e.stopPropagation();
            handleEditUser();
          }}
          disabled={disabled}
        >
          <Edit className="h-5 w-5 mr-2" />
          Edit
        </Button>

        {/* Assign Business Units Button - 44px min touch target */}
        <Button
          variant="outline"
          size="sm"
          className="min-h-[44px] min-w-[44px] px-3 flex-1"
          onClick={(e) => {
            e.stopPropagation();
            handleAssignBusinessUnits();
          }}
          disabled={disabled}
        >
          <Building2 className="h-5 w-5 mr-2" />
          Business Units
        </Button>
      </div>

      {/* Sheets */}
      {editingUser && (
        <EditUserSheet
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setEditingUser(null);
            }
          }}
          user={editingUser}
          onSuccess={() => {
            onUpdate();
            setEditingUser(null);
          }}
          onUserUpdated={(updatedUser) => {
            if (onUserUpdated) {
              onUserUpdated(updatedUser);
              onUpdate();
            } else {
              onUpdate();
            }
            setEditingUser(null);
          }}
        />
      )}

      {assigningBusinessUnits && (
        <AssignBusinessUnitsSheet
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setAssigningBusinessUnits(null);
            }
          }}
          user={assigningBusinessUnits}
          onSuccess={() => {
            onUpdate();
            setAssigningBusinessUnits(null);
          }}
        />
      )}
    </>
  );
}
