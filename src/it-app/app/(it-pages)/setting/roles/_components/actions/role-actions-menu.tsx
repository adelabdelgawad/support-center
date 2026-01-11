"use client";

import { Button } from "@/components/ui/button";
import {
  Edit,
  Shield,
  Users,
} from "lucide-react";
import { useState } from "react";
import { EditRolePagesSheet } from "../modal/edit-role-pages-sheet";
import { EditRoleSheet } from "../modal/edit-role-sheet";
import { EditRoleUsersSheet } from "../modal/edit-role-users-sheet";
import { useRolesActions } from "@/app/(it-pages)/setting/roles/context/roles-actions-context";
import type { RoleResponse } from "@/types/roles";
import type { PageResponse } from "@/types/pages";
import type { AuthUserResponse } from "@/types/users";

interface RoleActionsProps {
  role: RoleResponse;
  preloadedPages: PageResponse[];
  preloadedUsers: AuthUserResponse[];
}

export function RoleActions({
  role,
  preloadedPages,
  preloadedUsers,
}: RoleActionsProps) {
  const { handleUpdateRole, updateCounts } = useRolesActions();
  const [editRolesOpen, setEditRolesOpen] = useState(false);
  const [editRoleOpen, setEditRoleOpen] = useState(false);
  const [editUsersOpen, setEditUsersOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-1">
        {/* Edit Role Button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0"
          onClick={(e) => {
            e.stopPropagation();
            setEditRoleOpen(true);
          }}
        >
          <span className="sr-only">Edit Role</span>
          <Edit className="h-4 w-4 text-muted-foreground" />
        </Button>

        {/* Edit Pages Button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0"
          onClick={(e) => {
            e.stopPropagation();
            setEditRolesOpen(true);
          }}
        >
          <span className="sr-only">Edit Pages</span>
          <Shield className="h-4 w-4 text-primary" />
        </Button>

        {/* Edit Users Button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0"
          onClick={(e) => {
            e.stopPropagation();
            setEditUsersOpen(true);
          }}
        >
          <span className="sr-only">Edit Users</span>
          <Users className="h-4 w-4 text-primary" />
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
        open={editRolesOpen}
        onOpenChange={(open) => {
          setEditRolesOpen(open);
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
