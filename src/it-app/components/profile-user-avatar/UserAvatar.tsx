'use client';

import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export function UserAvatar() {
  return (
    <Avatar className="h-9 w-9 cursor-pointer border border-gray-200">
      <AvatarImage src="/image.jpg" alt="User Avatar" />
      <AvatarFallback className="bg-gray-300 text-gray-600">
        U
      </AvatarFallback>
    </Avatar>
  );
}
