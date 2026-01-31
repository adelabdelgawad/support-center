'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserInfo } from '@/lib/types/auth';
import { User as UserIcon, LogOut } from 'lucide-react';
interface UserAvatarProps {
  user: UserInfo;
}

export default function UserAvatar({ user }: UserAvatarProps) {
  const handleSignOut = async () => {
    try {
      // Call logout API route
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Always redirect to login, even if API call fails
      window.location.href = '/login';
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Avatar className="cursor-pointer">
          <AvatarImage alt={user?.fullName || user?.username} />
          <AvatarFallback>
            <UserIcon className="w-6 h-6 text-gray-400" />
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="end">
        <DropdownMenuLabel>{user?.username}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="flex items-center gap-2">
          <UserIcon className="w-4 h-4" />
          {user?.fullName || 'User'}
        </DropdownMenuItem>
        {user?.email && (
          <DropdownMenuItem className="flex items-center gap-2 text-xs text-gray-500">
            {user.email}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleSignOut}
          className="flex items-center gap-2 text-red-500 focus:bg-red-50 cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
