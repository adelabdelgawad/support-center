# Page Pattern Reference

Server-side rendered pages with authentication and data fetching.

## Key Principles

1. **No "use client"** - Page is a server component
2. **await searchParams** - Required in Next.js 15+
3. **auth() check** - Redirect if not authenticated
4. **Pass initialData** - SSR data to client component

## Basic Page Structure

```tsx
// app/(pages)/setting/items/page.tsx
import { auth } from "@/lib/auth/server-auth";
import { getItems } from "@/lib/actions/items.actions";
import { redirect } from "next/navigation";
import ItemsTable from "./_components/table/items-table";

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    search?: string;
    is_active?: string;
  }>;
}) {
  // 1. Check authentication
  const session = await auth();
  if (!session?.accessToken) {
    redirect("/login");
  }

  // 2. Await searchParams (Next.js 15+ requirement)
  const params = await searchParams;
  const { page, limit, search, is_active } = params;

  // 3. Parse pagination
  const pageNumber = Number(page) || 1;
  const limitNumber = Number(limit) || 10;
  const skip = (pageNumber - 1) * limitNumber;

  // 4. Build filters
  const filters = {
    is_active,
    search,
  };

  // 5. Fetch data server-side
  const items = await getItems(limitNumber, skip, filters);

  // 6. Pass to client component
  return <ItemsTable initialData={items} />;
}
```

## With Related Data

```tsx
// Fetch multiple related datasets for forms
export default async function UsersPage({ searchParams }) {
  const session = await auth();
  if (!session?.accessToken) redirect("/login");

  const params = await searchParams;
  const pageNumber = Number(params.page) || 1;
  const limitNumber = Number(params.limit) || 10;

  // Main data
  const users = await getUsers(limitNumber, (pageNumber - 1) * limitNumber, {
    is_active: params.is_active,
    search: params.search,
    role: params.role,
  });

  // Related data for forms (fetch all, not paginated)
  const rolesResponse = await getRoles({
    limit: 1000,
    skip: 0,
    filterCriteria: { is_active: 'true' }
  });
  const roles = rolesResponse.roles ?? [];

  // Optional data with fallback
  let domainUsers = [];
  try {
    domainUsers = await getDomainUsers(true) ?? [];
  } catch {
    domainUsers = [];
  }

  return (
    <UsersTable
      initialData={users}
      roles={roles}
      domainUsers={domainUsers}
    />
  );
}
```

## Dynamic Routes

```tsx
// app/(pages)/asset/[asset_type]/page.tsx
import { auth } from "@/lib/auth/server-auth";
import { getAssets, getAssetType } from "@/lib/actions/assets.actions";
import { redirect, notFound } from "next/navigation";
import AssetsTable from "./_components/table/assets-table";

interface Props {
  params: Promise<{ asset_type: string }>;
  searchParams: Promise<{ page?: string; limit?: string }>;
}

export default async function AssetTypePage({ params, searchParams }: Props) {
  const session = await auth();
  if (!session?.accessToken) redirect("/login");

  // Await both params and searchParams
  const { asset_type } = await params;
  const { page, limit } = await searchParams;

  // Validate asset type exists
  const assetType = await getAssetType(asset_type);
  if (!assetType) {
    notFound();
  }

  const pageNumber = Number(page) || 1;
  const limitNumber = Number(limit) || 10;

  const assets = await getAssets(asset_type, limitNumber, (pageNumber - 1) * limitNumber);

  return (
    <AssetsTable
      initialData={assets}
      assetType={assetType}
    />
  );
}
```

## Layout Pattern

```tsx
// app/(pages)/layout.tsx
import { auth } from "@/lib/auth/server-auth";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/navbar/navbar";

export default async function PagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.accessToken) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen">
      <Navbar />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
```

## SearchParams Type Patterns

```tsx
// Simple pagination
searchParams: Promise<{
  page?: string;
  limit?: string;
}>

// With filtering
searchParams: Promise<{
  page?: string;
  limit?: string;
  search?: string;
  is_active?: string;
  status?: string;
}>

// With sorting
searchParams: Promise<{
  page?: string;
  limit?: string;
  sort?: string;      // Column name
  order?: 'asc' | 'desc';
}>

// Full featured
searchParams: Promise<{
  page?: string;
  limit?: string;
  search?: string;
  is_active?: string;
  role?: string;
  status?: string;
  sort?: string;
  order?: string;
  from?: string;      // Date filter
  to?: string;
}>
```

## Error Handling

```tsx
export default async function ItemsPage({ searchParams }) {
  const session = await auth();
  if (!session?.accessToken) redirect("/login");

  const params = await searchParams;

  try {
    const items = await getItems(10, 0, params);
    return <ItemsTable initialData={items} />;
  } catch (error) {
    // Log error server-side
    console.error("Failed to fetch items:", error);
    
    // Return empty state or error component
    return (
      <ItemsTable 
        initialData={{ items: [], total: 0, activeCount: 0, inactiveCount: 0 }} 
      />
    );
  }
}
```

## Key Points

1. **Always server component** - No "use client" directive
2. **await searchParams** - Next.js 15+ async params
3. **auth() first** - Check authentication before data fetch
4. **redirect() for auth** - Don't render if not authenticated
5. **Pass initialData prop** - Client component receives SSR data
6. **Fetch related data** - Get dropdown options, etc. server-side
7. **Handle errors gracefully** - Return empty state on error
