"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { toastSuccess, toastError } from "@/lib/toast";
import { AddUserSheet } from "../modal/add-user-sheet";
import { createUser } from "@/lib/api/users";
import { UserPlus } from "lucide-react";
import type { UserCreate, UserWithRolesResponse } from "@/types/users";

interface AddUserButtonProps {
  onAdd: () => void;
  addUser?: (newUser: UserWithRolesResponse) => Promise<void>;
}

export const AddUserButton: React.FC<AddUserButtonProps> = ({ onAdd, addUser }) => {
  const [isOpen, setIsOpen] = React.useState(false);

  const handleSave = async (user: UserCreate): Promise<void> => {
    try {
      const createdUser = await createUser(user);

      // Use optimistic update if available, otherwise fallback to refetch
      if (addUser && createdUser && typeof createdUser === 'object' && 'id' in createdUser) {
        await addUser(createdUser as any);
      } else {
        onAdd();
      }

      setIsOpen(false);
      toastSuccess("User created successfully");
    } catch (err: unknown) {
      if (err instanceof Error) {
        toastError(err.message || "Failed to create user");
      } else {
        toastError("Failed to create user");
      }
    }
  };

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        variant="default"
        size="sm"
      >
        <UserPlus className="w-4 h-4 mr-1" />
        Add User
      </Button>

      <AddUserSheet
        open={isOpen}
        onOpenChange={setIsOpen}
        onSave={handleSave}
      />
    </>
  );
};
