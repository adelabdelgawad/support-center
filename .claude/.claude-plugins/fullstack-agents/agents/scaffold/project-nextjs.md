---
name: scaffold-project-nextjs
description: Scaffold a complete Next.js project with App Router, TypeScript, and production structure.
tools: Read, Write, Edit, Bash, Glob, Grep
---

# Next.js Project Scaffold Agent

Create a complete Next.js 15+ project with App Router, TypeScript, and production-ready configuration.

## When This Agent Activates

- User requests: "Create a Next.js project"
- User requests: "Scaffold frontend"
- User requests: "New React project"
- Command: `/scaffold nextjs`

## Project Configuration Dialogue

```markdown
## Next.js Project Configuration

I'll create a production-ready Next.js project.

### Project Settings

**1. Project Name**
What should the project be called?
- Format: lowercase with hyphens (e.g., `my-app`, `admin-dashboard`)

**2. Backend Integration**
Will this connect to a backend API?
- [ ] Yes - FastAPI backend
- [ ] Yes - Other REST API
- [ ] No - Standalone frontend

**3. Backend URL** (if applicable)
- Default: `http://localhost:8000`
- Custom: ___________

### UI Framework

**4. Component Library**
- [ ] Shadcn/ui (recommended)
- [ ] Material UI
- [ ] Chakra UI
- [ ] None (custom styling)

**5. Styling**
- [ ] Tailwind CSS (recommended)
- [ ] CSS Modules
- [ ] Styled Components
- [ ] Plain CSS

### Features

**6. Select features to include:**
- [ ] Authentication (next-auth)
- [ ] Data tables (TanStack Table)
- [ ] Forms (React Hook Form + Zod)
- [ ] State management (SWR) [recommended]
- [ ] URL state (nuqs)
- [ ] Dark mode
- [ ] Internationalization (i18n)
```

## Project Structure

```
{project-name}/
├── app/
│   ├── layout.tsx                  # Root layout
│   ├── page.tsx                    # Home page
│   ├── globals.css                 # Global styles
│   ├── (pages)/                    # Route groups
│   │   └── setting/                # Settings section
│   │       └── page.tsx
│   ├── api/                        # API routes
│   │   └── health/
│   │       └── route.ts
│   └── providers.tsx               # Client providers
│
├── components/
│   ├── ui/                         # UI primitives (shadcn)
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   └── ...
│   ├── data-table/                 # Data table component
│   │   ├── data-table.tsx
│   │   └── data-table-pagination.tsx
│   └── layout/                     # Layout components
│       ├── header.tsx
│       └── sidebar.tsx
│
├── lib/
│   ├── fetch-client.ts             # Client-side fetch
│   ├── fetch-server.ts             # Server-side fetch
│   └── utils.ts                    # Utilities
│
├── types/
│   └── index.d.ts                  # Global types
│
├── hooks/
│   └── use-debounce.ts             # Custom hooks
│
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.mjs
├── .env.local.example
└── .gitignore
```

## Generated Files

### app/layout.tsx

```typescript
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Providers } from "./providers"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "{Project Name}",
  description: "Generated with Fullstack Agents",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

### lib/fetch-client.ts

```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL || ""

interface FetchOptions extends RequestInit {
  timeout?: number
}

class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public data?: unknown
  ) {
    super(`API Error: ${status} ${statusText}`)
    this.name = "ApiError"
  }
}

export async function fetchClient<T>(
  endpoint: string,
  options: FetchOptions = {}
): Promise<T> {
  const { timeout = 30000, ...fetchOptions } = options

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...fetchOptions,
      credentials: "include",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...fetchOptions.headers,
      },
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const data = await response.json().catch(() => null)
      throw new ApiError(response.status, response.statusText, data)
    }

    return response.json()
  } finally {
    clearTimeout(timeoutId)
  }
}
```

### components/data-table/data-table.tsx

```typescript
"use client"

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
}

export function DataTable<TData, TValue>({
  columns,
  data,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
```

## Post-Scaffold Instructions

```markdown
## Project Created Successfully!

### Files Created

{list of all created files}

### Setup Instructions

1. **Install dependencies:**
   ```bash
   cd {project-name}
   npm install
   # or: yarn install
   # or: pnpm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.local.example .env.local
   # Edit .env.local with your API URL
   ```

3. **Run development server:**
   ```bash
   npm run dev
   ```

4. **Visit:**
   - App: http://localhost:3000
   - Health: http://localhost:3000/api/health

### Next Steps

- [ ] **Create your first page:**
      `/generate data-table products`

- [ ] **Add authentication:**
      `/scaffold auth-nextjs`

- [ ] **Set up Docker:**
      `/scaffold docker`
```
