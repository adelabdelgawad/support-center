# Fetch Architecture Examples

Real-world examples for Next.js fetch utilities.

## Example 1: Client Component with SWR

```typescript
// app/(pages)/dashboard/_components/user-stats.tsx
"use client";

import useSWR from "swr";
import { fetchClient } from "@/lib/fetch/client";
import { Skeleton } from "@/components/ui/skeleton";

interface UserStats {
  totalUsers: number;
  activeUsers: number;
  newToday: number;
}

const fetcher = (url: string) => 
  fetchClient.get<UserStats>(url).then(r => r.data);

export function UserStats() {
  const { data, error, isLoading } = useSWR('/api/stats/users', fetcher, {
    refreshInterval: 30000,  // Refresh every 30 seconds
    revalidateOnFocus: true,
  });

  if (isLoading) return <Skeleton className="h-24 w-full" />;
  if (error) return <div className="text-red-500">Failed to load stats</div>;

  return (
    <div className="grid grid-cols-3 gap-4">
      <StatCard title="Total Users" value={data?.totalUsers} />
      <StatCard title="Active" value={data?.activeUsers} />
      <StatCard title="New Today" value={data?.newToday} />
    </div>
  );
}
```

## Example 2: Server Action for Data Mutation

```typescript
// lib/actions/users.actions.ts
"use server";

import { serverPost, serverPut, serverDelete } from "@/lib/fetch/server";
import { revalidatePath } from "next/cache";
import type { User, UserCreate, UserUpdate } from "@/types/users";

export async function createUser(data: UserCreate): Promise<{
  success: boolean;
  data?: User;
  error?: string;
}> {
  try {
    const user = await serverPost<User>("/api/setting/users", data);
    revalidatePath("/setting/users");
    return { success: true, data: user };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to create user" 
    };
  }
}

export async function updateUser(
  userId: string, 
  data: UserUpdate
): Promise<{ success: boolean; error?: string }> {
  try {
    await serverPut(`/api/setting/users/${userId}`, data);
    revalidatePath("/setting/users");
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to update user" 
    };
  }
}

export async function deleteUser(
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await serverDelete(`/api/setting/users/${userId}`);
    revalidatePath("/setting/users");
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to delete user" 
    };
  }
}
```

## Example 3: Form with Server Action

```typescript
// app/(pages)/setting/users/_components/create-user-form.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createUser } from "@/lib/actions/users.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function CreateUserForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    role: "user"
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    startTransition(async () => {
      const result = await createUser(formData);
      
      if (result.success) {
        toast.success("User created successfully");
        router.push("/setting/users");
      } else {
        toast.error(result.error || "Failed to create user");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        placeholder="Name"
        value={formData.name}
        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
        required
      />
      <Input
        type="email"
        placeholder="Email"
        value={formData.email}
        onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
        required
      />
      <Button type="submit" disabled={isPending}>
        {isPending ? "Creating..." : "Create User"}
      </Button>
    </form>
  );
}
```

## Example 4: Server Component with SSR Data

```typescript
// app/(pages)/setting/users/page.tsx
import { auth } from "@/lib/auth/server-auth";
import { redirect } from "next/navigation";
import { serverGet } from "@/lib/fetch/server";
import UsersTable from "./_components/users-table";

interface UsersResponse {
  items: User[];
  total: number;
  page: number;
  limit: number;
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; limit?: string; search?: string }>;
}) {
  const session = await auth();
  if (!session?.accessToken) redirect("/login");

  const params = await searchParams;
  const page = Number(params.page) || 1;
  const limit = Number(params.limit) || 10;
  const search = params.search || "";

  // Server-side data fetching
  const queryParams = new URLSearchParams({
    limit: limit.toString(),
    skip: ((page - 1) * limit).toString(),
    ...(search && { search }),
  });

  const users = await serverGet<UsersResponse>(
    `/api/setting/users?${queryParams.toString()}`
  );

  return (
    <div className="container py-6">
      <h1 className="text-2xl font-bold mb-6">Users</h1>
      <UsersTable 
        initialData={users} 
        page={page} 
        limit={limit}
        search={search}
      />
    </div>
  );
}
```

## Example 5: API Route with Multiple Operations

```typescript
// app/api/setting/users/route.ts
import { NextRequest } from "next/server";
import { withAuth, backendGet, backendPost } from "@/lib/fetch/api-route-helper";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams.toString();
  return withAuth(token => 
    backendGet(`/setting/users/?${params}`, token)
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  return withAuth(token => 
    backendPost('/setting/users/', token, body)
  );
}
```

```typescript
// app/api/setting/users/[userId]/route.ts
import { NextRequest } from "next/server";
import { withAuth, backendGet, backendPut, backendDelete } from "@/lib/fetch/api-route-helper";

interface RouteParams {
  params: Promise<{ userId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { userId } = await params;
  return withAuth(token => 
    backendGet(`/setting/users/${userId}`, token)
  );
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { userId } = await params;
  const body = await request.json();
  return withAuth(token => 
    backendPut(`/setting/users/${userId}`, token, body)
  );
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { userId } = await params;
  return withAuth(token => 
    backendDelete(`/setting/users/${userId}`, token)
  );
}
```

## Example 6: Optimistic Updates with SWR

```typescript
// app/(pages)/setting/users/_components/user-row.tsx
"use client";

import { useSWRConfig } from "swr";
import { fetchClient } from "@/lib/fetch/client";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export function UserRow({ user }: { user: User }) {
  const { mutate } = useSWRConfig();

  const handleToggleActive = async () => {
    // Optimistic update
    mutate(
      '/api/setting/users',
      (current: any) => ({
        ...current,
        items: current.items.map((u: User) =>
          u.id === user.id ? { ...u, is_active: !u.is_active } : u
        ),
      }),
      false  // Don't revalidate yet
    );

    try {
      await fetchClient.put(`/api/setting/users/${user.id}/status`, {
        is_active: !user.is_active,
      });
      
      // Revalidate to get server state
      mutate('/api/setting/users');
      toast.success(`User ${!user.is_active ? 'activated' : 'deactivated'}`);
      
    } catch (error) {
      // Revert on error
      mutate('/api/setting/users');
      toast.error("Failed to update user status");
    }
  };

  return (
    <tr>
      <td>{user.name}</td>
      <td>{user.email}</td>
      <td>
        <Switch 
          checked={user.is_active} 
          onCheckedChange={handleToggleActive} 
        />
      </td>
    </tr>
  );
}
```

## Example 7: File Upload with Progress

```typescript
// lib/fetch/upload.ts
"use client";

export async function uploadFile(
  file: File,
  onProgress?: (percent: number) => void
): Promise<{ url: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress((e.loaded / e.total) * 100);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error('Upload failed'));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Upload failed')));
    xhr.open('POST', '/api/upload');
    xhr.withCredentials = true;
    xhr.send(formData);
  });
}
```

## Example 8: Error Boundary Integration

```typescript
// app/(pages)/setting/users/error.tsx
"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Users page error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px]">
      <h2 className="text-xl font-semibold mb-4">Something went wrong!</h2>
      <p className="text-muted-foreground mb-4">{error.message}</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
```

## Common Patterns Summary

| Pattern | Use Case | Function |
|---------|----------|----------|
| Client GET | Fetch data in client component | `fetchClient.get()` |
| Client POST | Submit form in client component | `fetchClient.post()` |
| Server GET | SSR data fetching | `serverGet()` |
| Server POST | Server action mutation | `serverPost()` |
| API Route | Proxy to backend | `withAuth()` + `backendGet/Post()` |
| SWR | Client-side caching | `useSWR()` + `fetchClient` |
