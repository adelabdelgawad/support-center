"use client";

import { Button } from "@/components/ui/button";
import { Edit, Shield, Users, Loader2 } from "lucide-react";
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

  const handleEditRole = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditRoleOpen(true);
  };

  const handleEditPages = async (e: React.MouseEvent) => {
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

  const handleEditUsers = async (e: React.MouseEvent) => {
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
          disabled={isLoadingPages}
        >
          {isLoadingPages ? (
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
          ) : (
            <Shield className="h-5 w-5 mr-2" />
          )}
          Pages
        </Button>

        {/* Edit Users Button */}
        <Button
          variant="outline"
          size="sm"
          className="min-h-[44px] min-w-[44px] px-3 flex-1"
          onClick={handleEditUsers}
          disabled={isLoadingUsers}
        >
          {isLoadingUsers ? (
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
          ) : (
            <Users className="h-5 w-5 mr-2" />
          )}
          Users
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
                (document.activeElement as HTMLElement | null)?.blur();
              }, 100);
            }
          }}
        />
      )}

      {/* Edit Pages Sheet */}
      {editPagesOpen && (
        <EditRolePagesSheet
          role={role}
          currentPages={currentRolePages}
          availablePages={preloadedPages}
          onOpenChange={(open) => {
            setEditPagesOpen(open);
            if (!open) {
              setTimeout(() => {
                (document.activeElement as HTMLElement | null)?.blur();
              }, 100);
            }
          }}
          onMutate={async (updatedRole: RoleResponse) => {
            await handleUpdateRole(role.id, updatedRole);
          }}
        />
      )}

      {/* Edit Users Sheet */}
      {editUsersOpen && (
        <EditRoleUsersSheet
          role={role}
          currentUsers={currentRoleUsers}
          availableUsers={preloadedUsers}
          onOpenChange={(open) => {
            setEditUsersOpen(open);
            if (!open) {
              setTimeout(() => {
                (document.activeElement as HTMLElement | null)?.blur();
              }, 100);
            }
          }}
          onMutate={async (updatedRole: RoleResponse) => {
            await handleUpdateRole(role.id, updatedRole);
          }}
        />
      )}
    </>
  );
}
