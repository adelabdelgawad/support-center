"use client";

import { Button } from "@/components/ui/button";
import { Edit, Eye, Building2, Layers } from "lucide-react";
import { useState } from "react";
import { EditUserSheet } from "../modal";
import { ViewUserSheet } from "../modal";
import { AssignBusinessUnitsSheet } from "../modal";
import { AssignSectionsSheet } from "../modal";
import type { UserWithRolesResponse, UserSectionInfo } from "@/types/users";
import type { Section } from "@/lib/api/sections";

interface UserActionsProps {
  user: UserWithRolesResponse;
  onUpdate: () => void;
  onUserUpdated?: (updatedUser: UserWithRolesResponse) => void;
  disabled?: boolean;
  sections: Section[];
}

export function UserActions({ user, onUpdate, onUserUpdated, disabled = false, sections }: UserActionsProps) {
  const [editingUser, setEditingUser] = useState<UserWithRolesResponse | null>(null);
  const [viewingUser, setViewingUser] = useState<UserWithRolesResponse | null>(null);
  const [assigningBusinessUnits, setAssigningBusinessUnits] = useState<UserWithRolesResponse | null>(null);
  const [assigningSections, setAssigningSections] = useState<UserWithRolesResponse | null>(null);

  const handleViewUser = () => {
    setViewingUser(user);
  };

  const handleEditUser = () => {
    setEditingUser(user);
  };

  const handleAssignBusinessUnits = () => {
    setAssigningBusinessUnits(user);
  };

  const handleAssignSections = () => {
    setAssigningSections(user);
  };

  return (
    <>
      <div className="flex items-center gap-1">
        {/* View User Button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0"
          onClick={(e) => {
            e.stopPropagation();
            handleViewUser();
          }}
          disabled={disabled}
        >
          <span className="sr-only">View User</span>
          <Eye className="h-4 w-4 text-blue-600" />
        </Button>

        {/* Edit User Button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0"
          onClick={(e) => {
            e.stopPropagation();
            handleEditUser();
          }}
          disabled={disabled}
        >
          <span className="sr-only">Edit User</span>
          <Edit className="h-4 w-4 text-gray-600" />
        </Button>

        {/* Assign Business Units Button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0"
          onClick={(e) => {
            e.stopPropagation();
            handleAssignBusinessUnits();
          }}
          disabled={disabled}
        >
          <span className="sr-only">Assign Business Units</span>
          <Building2 className="h-4 w-4 text-green-600" />
        </Button>

        {/* Assign Sections Button */}
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 p-0"
          onClick={(e) => {
            e.stopPropagation();
            handleAssignSections();
          }}
          disabled={disabled}
        >
          <span className="sr-only">Assign Sections</span>
          <Layers className="h-4 w-4 text-purple-600" />
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

      {viewingUser && (
        <ViewUserSheet
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setViewingUser(null);
            }
          }}
          user={viewingUser}
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

      {assigningSections && (
        <AssignSectionsSheet
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setAssigningSections(null);
            }
          }}
          user={assigningSections}
          sections={sections}
          onSuccess={(updatedSections: UserSectionInfo[]) => {
            if (onUserUpdated && assigningSections) {
              onUserUpdated({ ...assigningSections, sections: updatedSections });
            }
            setAssigningSections(null);
          }}
        />
      )}
    </>
  );
}
