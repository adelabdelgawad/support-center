"use client";

/**
 * Dashboard Client Component
 *
 * Displays the main dashboard with:
 * - Welcome message
 * - Key metrics cards
 * - Quick action buttons
 * - Navigation cards to main sections
 * - Recent activity
 */

import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  Inbox,
  AlertCircle,
  CheckCircle,
  Clock,
  BarChart3,
  Settings,
  ArrowRight,
  Ticket,
  Users,
} from "lucide-react";
import type { AppUser } from "@/types/auth";
import type { DashboardStats } from "@/lib/actions/dashboard.actions";

interface DashboardClientProps {
  user: AppUser;
  stats: DashboardStats;
}

export function DashboardClient({ user, stats }: DashboardClientProps) {
  const isTechnician = user?.isTechnician || false;
  const isSuperAdmin = user?.isSuperAdmin || false;

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      {/* Welcome Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome back{user?.fullName ? `, ${user.fullName}` : ''}
        </h1>
        <p className="text-muted-foreground mt-1">
          Here&apos;s an overview of your IT support center
        </p>
      </div>

      {/* Key Metrics - Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Unassigned Tickets */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Unassigned Tickets
            </CardTitle>
            <Inbox className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.counts.unassigned || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Waiting for assignment
            </p>
            <Link href="/support-center/requests?view=unassigned">
              <Button variant="link" size="sm" className="px-0 mt-2">
                View all <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* My Tickets (for technicians) */}
        {isTechnician && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                My Unsolved Tickets
              </CardTitle>
              <AlertCircle className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.counts.my_unsolved || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Assigned to you
              </p>
              <Link href="/support-center/requests?view=my_unsolved">
                <Button variant="link" size="sm" className="px-0 mt-2">
                  View my tickets <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* All Unsolved */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              All Unsolved Tickets
            </CardTitle>
            <Ticket className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.counts.all_unsolved || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Currently active
            </p>
            <Link href="/support-center/requests?view=all_unsolved">
              <Button variant="link" size="sm" className="px-0 mt-2">
                View all <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Recently Solved */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Recently Solved
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.counts.recently_solved || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Last 7 days
            </p>
            <Link href="/support-center/requests?view=recently_solved">
              <Button variant="link" size="sm" className="px-0 mt-2">
                View solved <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-xl font-semibold mb-3">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/support-center/requests?view=unassigned">
            <Button variant="default">
              <Inbox className="h-4 w-4 mr-2" />
              View Unassigned
            </Button>
          </Link>
          {isTechnician && (
            <Link href="/support-center/requests?view=my_unsolved">
              <Button variant="outline">
                <AlertCircle className="h-4 w-4 mr-2" />
                My Tickets
              </Button>
            </Link>
          )}
          <Link href="/support-center/requests?view=all_unsolved">
            <Button variant="outline">
              <Ticket className="h-4 w-4 mr-2" />
              All Active Tickets
            </Button>
          </Link>
          <Link href="/reports">
            <Button variant="outline">
              <BarChart3 className="h-4 w-4 mr-2" />
              View Reports
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Navigation Cards */}
      <div>
        <h2 className="text-xl font-semibold mb-3">Main Sections</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Support Center */}
          <Link href="/support-center/requests">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <LayoutDashboard className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Support Center</CardTitle>
                    <CardDescription>Manage service requests</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Unassigned:</span>
                    <Badge variant="secondary">{stats.counts.unassigned || 0}</Badge>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Active:</span>
                    <Badge variant="secondary">{stats.counts.all_unsolved || 0}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Reports & Analytics */}
          <Link href="/reports">
            <Card className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 rounded-lg">
                    <BarChart3 className="h-6 w-6 text-blue-500" />
                  </div>
                  <div>
                    <CardTitle>Reports & Analytics</CardTitle>
                    <CardDescription>Performance metrics</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  View executive dashboards, SLA compliance, agent performance, and volume analytics.
                </p>
              </CardContent>
            </Card>
          </Link>

          {/* Settings (Admin only) */}
          {isSuperAdmin && (
            <Link href="/admin/setting/users">
              <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/10 rounded-lg">
                      <Settings className="h-6 w-6 text-purple-500" />
                    </div>
                    <div>
                      <CardTitle>Settings</CardTitle>
                      <CardDescription>System configuration</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Manage users, roles, business units, SLA configurations, and system settings.
                  </p>
                </CardContent>
              </Card>
            </Link>
          )}
        </div>
      </div>

      {/* Recent Activity */}
      {stats.recentRequests && stats.recentRequests.length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-3">Recent Activity</h2>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Recently Updated Tickets</CardTitle>
                  <CardDescription>Latest ticket activity</CardDescription>
                </div>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats.recentRequests.map((request) => (
                  <Link
                    key={request.id}
                    href={`/support-center/requests/${request.id}`}
                    className="block"
                  >
                    <div className="flex items-start justify-between p-3 rounded-lg border hover:bg-accent transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">
                          {request.subject}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(request.requested).toISOString().split('T')[0]} •{' '}
                          {request.status?.name}
                        </p>
                      </div>
                      {request.priority?.name && (
                        <Badge variant="outline" className="ml-2 shrink-0">
                          {request.priority.name}
                        </Badge>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
              <Link href="/support-center/requests?view=recently_updated">
                <Button variant="link" size="sm" className="w-full mt-3">
                  View all recent activity <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      )}

      {/* User Info Card (for reference/debugging) */}
      {user && (
        <Card className="bg-muted/50">
          <CardHeader>
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle className="text-base">Your Profile</CardTitle>
                <CardDescription>
                  {user.username} • {user.isTechnician ? 'Technician' : 'User'}
                  {user.isSuperAdmin && ' • Super Admin'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
