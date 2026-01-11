import React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function UserInformation({ status }: { status: string }) {
  return (
    <div className="p-4 pb-2 flex items-center gap-3 border-b border-gray-200 dark:border-gray-700">
      <Avatar className="h-9 w-9">
        <AvatarImage src="/image.jpg" alt="User" />
        <AvatarFallback>U</AvatarFallback>
      </Avatar>
      <div>
        <div className="font-bold text-gray-900 dark:text-gray-100">Mohamed ElNady</div>
        <div className="text-xs text-gray-500 dark:text-gray-400">{status}</div>
      </div>
    </div>
  );
}
