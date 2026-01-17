// app/(pages)/setting/categories/page.tsx
import { validateAgentAccess } from "@/lib/actions/validate-agent-access.actions";
import { getCategories } from "@/lib/actions/categories.actions";
import CategoriesTable from "./_components/table/categories-table";

export const metadata = {
  title: "Categories",
  description: "Manage service request categories",
};

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{
    is_active?: string;
    name?: string;
  }>;
}) {
  // Validate technician access before processing
  await validateAgentAccess();

  const params = await searchParams;
  const { is_active, name } = params;

  // Fetch categories data with subcategories for better UX
  let response;
  try {
    response = await getCategories({
      activeOnly: false,
      includeSubcategories: true, // Preload all subcategories
      filterCriteria: {
        is_active: is_active || undefined,
        name: name || undefined,
      },
    });
  } catch (error) {
    console.error("Failed to fetch categories:", error);
    // Provide empty initial data on error
    response = {
      categories: [],
      total: 0,
      activeCount: 0,
      inactiveCount: 0,
      subcategoriesMap: {},
    };
  }

  return <CategoriesTable initialData={response} />;
}
