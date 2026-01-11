'use client';

import * as React from 'react';
import {
  LayoutDashboard,
  MessageSquare,
  Users,
  BarChart3,
  Settings,
  ChevronDown,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Menu items
const menuItems = [
  {
    title: 'Home',
    url: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    title: 'Tickets',
    url: '/dashboard/tickets',
    icon: MessageSquare,
    badge: 12,
  },
  {
    title: 'Customers',
    url: '/dashboard/customers',
    icon: Users,
  },
  {
    title: 'Reporting',
    url: '/dashboard/reporting',
    icon: BarChart3,
  },
  {
    title: 'Settings',
    url: '/dashboard/settings',
    icon: Settings,
  },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar className="border-r border-gray-700 bg-[#03363D]">
      {/* Header with Views Dropdown */}
      <SidebarHeader className="p-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="w-full justify-between bg-[#024950] hover:bg-[#035761] text-white border-0 h-9"
            >
              <span className="text-sm font-medium">All views</span>
              <ChevronDown className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem>All views</DropdownMenuItem>
            <DropdownMenuItem>My open tickets</DropdownMenuItem>
            <DropdownMenuItem>Unassigned tickets</DropdownMenuItem>
            <DropdownMenuItem>Recently updated</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarHeader>

      {/* Navigation Menu */}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const isActive = pathname === item.url;
                
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className={`
                        ${isActive 
                          ? 'bg-[#0F6973] text-white hover:bg-[#0F6973]' 
                          : 'text-gray-300 hover:bg-[#024950] hover:text-white'
                        }
                      `}
                    >
                      <Link href={item.url} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <item.icon className="w-5 h-5" />
                          <span>{item.title}</span>
                        </div>
                        {item.badge && (
                          <Badge className="bg-red-500 text-white hover:bg-red-600 text-xs">
                            {item.badge}
                          </Badge>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer with User Profile */}
      <SidebarFooter className="p-4 border-t border-gray-700">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 h-auto p-2 hover:bg-[#024950]"
            >
              <Avatar className="h-8 w-8">
                <AvatarImage src="/avatar.jpg" alt="John Doe" />
                <AvatarFallback className="bg-blue-500 text-white text-sm">
                  JD
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-start overflow-hidden">
                <p className="text-sm font-medium text-white truncate w-full">
                  John Doe
                </p>
                <p className="text-xs text-gray-400 truncate w-full">
                  john@example.com
                </p>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem>Profile</DropdownMenuItem>
            <DropdownMenuItem>Settings</DropdownMenuItem>
            <DropdownMenuItem>Log out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
