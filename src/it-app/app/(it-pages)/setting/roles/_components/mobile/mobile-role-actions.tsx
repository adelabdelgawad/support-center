"use client";

import { Button } from "@/components/ui/button";
import { Edit, Shield, Users } from "lucide-react";
import { useState } from "react";
import { EditRolePagesSheet } from "../modal/edit-role-pages-sheet";
import { EditRoleSheet } from "../modal/edit-role-sheet";
import { EditRoleUsersSheet } from "../modal/edit-role-users-sheet";
import { useRolesActions } from "@/app/(it-pages)/setting/roles/context/roles-actions-context";
import type { RoleResponse } from "@/types/roles";
import type { PageResponse } from "@/types/pages";
import type { AuthUserResponse } from "@/types/users";

interface MobileRoleActionsProps {
  role: RoleResponse;
  preloadedPages: PageResponse[];
  preloadedUsers: AuthUserResponse[];
}

/**
 * Mobile-optimized action buttons for role cards
 * All buttons are ≥44px for touch accessibility
 */
export function MobileRoleActions({
  role,
  preloadedPages,
  preloadedUsers,
}: MobileRoleActionsProps) {
  const { handleUpdateRole, updateCounts } = useRolesActions();
  const [editRoleOpen, setEditRoleOpen] = useState(false);
  const [editPagesOpen, setEditPagesOpen] = useState(false);
  const [editUsersOpen, setEditUsersOpen] = useState(false);

  const handleEditRole = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditRoleOpen(true);
  };

  const handleEditPages = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditPagesOpen(true);
  };

  const handleEditUsers = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditUsersOpen(true);
  };

  return (
    <>
      <div className="flex gap-2">
        {/* Edit Role Button */}
        <Button
          variant="outline"
          size="sm"
          className="min-h-[44px] min-w-[44px] px-3 flex-1"
          onClick={handleEditRole}
        >
          <Edit className="h-5 w-5 mr-2" />
          Edit
        </Button>

        {/* Edit Pages Button */}
        <Button
          variant="outline"
          size="sm"
          className="min-h-[44px] min-w-[44px] px-3 flex-1"
          onClick={handleEditPages}
        >
          <Shield className="h-5 w-5 mr-2" />
          Pages
        </Button>

        {/* Edit Users Button */}
        <Button
          variant="outline"
          size="sm"
          className="min-h-[44px] min-w-[44px] px-3 flex-1"
          onClick={handleEditUsers}
        >
          <Users className="h-5 w-5 mr-2" />
          Users
        </Button>
      </div>

      {/* Edit Role Sheet */}
      <EditRoleSheet
        role={role}
        open={editRoleOpen}
        onOpenChange={(open) => {
          setEditRoleOpen(open);
          if (!open) {
            setTimeout(() => {
              (document.activeElement as HTMLElement | null)?.blur();
            }, 100);
          }
        }}
        onUpdate={(updatedRole) => {
          handleUpdateRole(role.id, updatedRole);
        }}
      />

      {/* Edit Pages Sheet */}
      <EditRolePagesSheet
        role={role}
        open={editPagesOpen}
        onOpenChange={(open) => {
          setEditPagesOpen(open);
          if (!open) {
            setTimeout(() => {
              (document.activeElement as HTMLElement | null)?.blur();
            }, 100);
          }
        }}
        onMutate={async () => {
          await updateCounts();
        }}
        preloadedPages={preloadedPages}
      />

      {/* Edit Users Sheet */}
      <EditRoleUsersSheet
        role={role}
        open={editUsersOpen}
        onOpenChange={(open) => {
          setEditUsersOpen(open);
          if (!open) {
            setTimeout(() => {
              (document.activeElement as HTMLElement | null)?.blur();
            }, 100);
          }
        }}
        onMutate={async () => {
          await updateCounts();
        }}
        preloadedUsers={preloadedUsers}
      />
    </>
  );
}
