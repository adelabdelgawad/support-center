'use client';

import React, { useState } from "react";
import { UserAvatar } from "./UserAvatar";
import UserInformation from "./UserInformation";
import StatusInformation from "./StatusInformation";
import ViewProfile from "./ViewProfile";
import Help from "./Help";
import SignOut from "./SignOut";

export default function UserProfileDropdown() {
  const [selectedStatus, setSelectedStatus] = useState("Offline");
  const [isOpen, setIsOpen] = useState(false);

  const handleAvatarClick = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div className="relative">
      <button
        onClick={handleAvatarClick}
        className="cursor-pointer hover:bg-gray-100 p-1 rounded-full transition-colors"
      >
        <UserAvatar />
      </button>
      
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-50">
          <UserInformation status={selectedStatus} />
          <StatusInformation selectedStatus={selectedStatus} onChange={setSelectedStatus} />
          <ViewProfile />
          <Help />
          <SignOut />
        </div>
      )}
    </div>
  );
}