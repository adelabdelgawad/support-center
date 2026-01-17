import { auth } from '@/lib/auth/server-auth';
import { validateAgentAccess } from '@/lib/actions/validate-agent-access.actions';
import { redirect } from 'next/navigation';
import { getSystemMessages } from '@/lib/actions/system-messages.actions';
import SystemMessagesTable from './_components/table/system-messages-table';

export const metadata = {
  title: 'System Messages',
  description: 'Manage system message templates',
};

export default async function SystemMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{
    is_active?: string;
    page?: string;
    limit?: string;
  }>;
}) {
  // Validate technician access before processing
  await validateAgentAccess();

  const session = await auth();
  if (!session?.accessToken) {
    redirect('/login');
  }

  const params = await searchParams;
  const { is_active, page: pageParam, limit: limitParam } = params;

  const page = Number(pageParam || '1');
  const limit = Number(limitParam || '10');
  const skip = (page - 1) * limit;

  let messagesData;

  try {
    messagesData = await getSystemMessages({
      limit,
      skip,
      filterCriteria: {
        is_active: is_active ? is_active === 'true' : undefined,
      },
    });
  } catch (error) {
    console.error('Failed to fetch system messages:', error);
    messagesData = {
      messages: [],
      total: 0,
      activeCount: 0,
      inactiveCount: 0,
    };
  }

  return <SystemMessagesTable initialData={messagesData} />;
}
