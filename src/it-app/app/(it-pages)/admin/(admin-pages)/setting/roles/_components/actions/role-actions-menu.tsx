"use client";

import { Button } from "@/components/ui/button";
import {
  Edit,
  Shield,
  Users,
  Loader2,
} from "lucide-react";
import { useState } from "react";
import { EditRolePagesSheet } from "../modal";
import { EditRoleSheet } from "../modal";
import { EditRoleUsersSheet } from "../modal";
import { useRolesActions } from "@/app/(it-pages)/admin/(admin-pages)/setting/roles/context/roles-actions-context";
import { getRolePages, fetchRoleUsers } from "@/lib/api/roles";
import { toastError } from "@/lib/toast";
import type { RoleResponse, PageRoleResponse } from "@/types/roles";
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
  const { handleUpdateRole } = useRolesActions();
  const [editRoleOpen, setEditRoleOpen] = useState(false);
  const [editPagesOpen, setEditPagesOpen] = useState(false);
  const [editUsersOpen, setEditUsersOpen] = useState(false);

  // Loading states for fetching data
  const [isLoadingPages, setIsLoadingPages] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  // Fetched data for sheets
  const [currentRolePages, setCurrentRolePages] = useState<PageRoleResponse[]>([]);
  const [currentRoleUsers, setCurrentRoleUsers] = useState<AuthUserResponse[]>([]);

  const handleEditPagesClick = async (e: React.MouseEvent) => {
    e.stopPropagation();

    // Fetch current pages before opening sheet
    setIsLoadingPages(true);
    try {
      const response = await getRolePages(role.id, true);
      setCurrentRolePages(response.pages || []);
      setEditPagesOpen(true);
    } catch (error) {
      toastError("Failed to load role pages");
    } finally {
      setIsLoadingPages(false);
    }
  };

  const handleEditUsersClick = async (e: React.MouseEvent) => {
    e.stopPropagation();

    // Fetch current users before opening sheet
    setIsLoadingUsers(true);
    try {
      const users = await fetchRoleUsers(role.id);
      setCurrentRoleUsers(users);
      setEditUsersOpen(true);
    } catch (error) {
      toastError("Failed to load role users");
    } finally {
      setIsLoadingUsers(false);
    }
  };

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
          onClick={handleEditPagesClick}
          disabled={isLoadingPages}
        >
          <span className="sr-only">Edit Pages</span>
          {isLoadingPages ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <Shield className="h-4 w-4 text-primary" />
          )}
        </Button>

        {/* Edit Users Button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0"
          onClick={handleEditUsersClick}
          disabled={isLoadingUsers}
        >
          <span className="sr-only">Edit Users</span>
          {isLoadingUsers ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <Users className="h-4 w-4 text-primary" />
          )}
        </Button>
      </div>

      {/* Edit Role Sheet */}
      {editRoleOpen && (
        <EditRoleSheet
          role={role}
          onOpenChange={(open) => {
            setEditRoleOpen(open);
            if (!open) {
              setTimeout(() => {
                if (typeof document !== 'undefined') {
                  (document.activeElement as HTMLElement | null)?.blur();
                }
              }, 100);
            }
          }}
        />
      )}

      {/* Edit Pages Sheet */}
      <EditRolePagesSheet
        role={role}
        currentPages={currentRolePages}
        availablePages={preloadedPages}
        open={editPagesOpen}
        onOpenChange={(open) => {
          setEditPagesOpen(open);
          if (!open) {
            setTimeout(() => {
              if (typeof document !== 'undefined') {
                (document.activeElement as HTMLElement | null)?.blur();
              }
            }, 100);
          }
        }}
        onMutate={async (updatedRole: RoleResponse) => {
          await handleUpdateRole(role.id, updatedRole);
        }}
      />

      {/* Edit Users Sheet */}
      <EditRoleUsersSheet
        role={role}
        currentUsers={currentRoleUsers}
        availableUsers={preloadedUsers}
        open={editUsersOpen}
        onOpenChange={(open) => {
          setEditUsersOpen(open);
          if (!open) {
            setTimeout(() => {
              if (typeof document !== 'undefined') {
                (document.activeElement as HTMLElement | null)?.blur();
              }
            }, 100);
          }
        }}
        onMutate={async (updatedRole: RoleResponse) => {
          await handleUpdateRole(role.id, updatedRole);
        }}
      />
    </>
  );
}
