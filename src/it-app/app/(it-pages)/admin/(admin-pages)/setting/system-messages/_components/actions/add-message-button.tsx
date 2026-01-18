"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { AddSystemMessageSheet } from "../modal";
import type { SystemMessageResponse } from "@/types/system-messages";

interface AddMessageButtonProps {
  onAdd?: () => void;
  addMessage?: (newMessage: SystemMessageResponse) => Promise<void>;
}

export function AddMessageButton({ onAdd, addMessage }: AddMessageButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open && onAdd) {
      onAdd();
    }
  };

  return (
    <>
      <Button
        variant="default"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="gap-2"
      >
        <Plus className="h-4 w-4" />
        Add Message
      </Button>

      {isOpen && (
        <AddSystemMessageSheet
          open={isOpen}
          onOpenChange={handleOpenChange}
        />
      )}
    </>
  );
}
