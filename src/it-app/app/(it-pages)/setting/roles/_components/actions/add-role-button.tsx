"use client";

import React, { useState } from "react";
import { AddRoleSheet } from "../modal/add-role-sheet";
import { Plus } from "lucide-react";
import { useRolesActions } from "@/app/(it-pages)/setting/roles/context/roles-actions-context";
import { Button } from "@/components/ui/button";

export const AddRoleButton: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { addRole } = useRolesActions();

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        size="sm"
        title="Add new role"
      >
        <Plus className="h-4 w-4" />
        Add Role
      </Button>

      <AddRoleSheet
        open={isOpen}
        onOpenChange={setIsOpen}
        onAdd={addRole}
      />
    </>
  );
};
