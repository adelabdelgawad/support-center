'use server';

import { redirect } from 'next/navigation';
import { serverFetch, CACHE_PRESETS } from '@/lib/api/server-fetch';
import { getServerUserInfo } from '@/lib/api/server-fetch';
import type { ServiceRequestDetail } from '@/types/ticket-detail';
import type { Technician, Priority, RequestNote } from '@/types/metadata';
import type { ChatMessage } from '@/lib/signalr/types';

/**
 * Fetch ALL ticket page data in parallel on the server
 * Includes: ticket, technicians, priorities, notes, initial messages, current user ID
 * Server Action for optimal performance
 *
 * Cache Strategy:
 * - ticket: NO_CACHE (real-time ticket state)
 * - technicians: REFERENCE_DATA (dropdown options)
 * - priorities: REFERENCE_DATA (dropdown options)
 * - notes: NO_CACHE (may be added during session)
 * - messages: NO_CACHE (real-time chat)
 */
export async function getTicketPageData(ticketId: string) {
  try {
    // Get current user info from server-side cookie
    const currentUser = await getServerUserInfo();
    const currentUserId = currentUser?.id;

    // Fetch ALL data in parallel for maximum performance
    const [ticket, technicians, priorities, notes, initialMessages] = await Promise.all([
      // Ticket details - NO_CACHE (real-time state)
      serverFetch<ServiceRequestDetail>(
        `/requests/${ticketId}`,
        CACHE_PRESETS.NO_CACHE()
      ),
      // Active technicians - REFERENCE_DATA (dropdown options)
      serverFetch<Technician[]>(
        '/users?is_technician=true&is_active=true',
        CACHE_PRESETS.REFERENCE_DATA('technicians')
      ).catch((error) => {
        console.error('Error fetching technicians:', error);
        return [] as Technician[];
      }),
      // Priorities - REFERENCE_DATA (dropdown options)
      serverFetch<Priority[]>(
        '/cache/priorities',
        CACHE_PRESETS.REFERENCE_DATA('priorities')
      ).catch((error) => {
        console.error('Error fetching priorities:', error);
        return [] as Priority[];
      }),
      // Request notes - NO_CACHE (may be added during session)
      serverFetch<RequestNote[]>(
        `/request-notes/${ticketId}/notes`,
        CACHE_PRESETS.NO_CACHE()
      ).catch((error) => {
        console.error('Error fetching notes:', error);
        return [] as RequestNote[];
      }),
      // Initial chat messages - NO_CACHE (real-time chat)
      serverFetch<ChatMessage[]>(
        `/chat/messages/request/${ticketId}?page=1&per_page=100`,
        CACHE_PRESETS.NO_CACHE()
      ).catch((error) => {
        console.error('Error fetching initial messages:', error);
        return [] as ChatMessage[];
      }),
    ]);

    // Enrich initial messages with sender information for instant display
    // This prevents showing "Technician" before WebSocket connects
    const enrichedMessages = initialMessages.map((msg: any) => {
      if (msg.sender) {
        // Already has sender info
        return msg;
      }

      // Look up sender from technicians or requester
      let sender = null;
      if (msg.senderId === ticket.requesterId) {
        // Message from requester
        sender = {
          id: ticket.requester.id,
          username: ticket.requester.username,
          fullName: ticket.requester.fullName,
          email: ticket.requester.email,
        };
      } else {
        // Message from technician - find in technicians array
        const tech = technicians.find((t: any) => t.id === msg.senderId);
        if (tech) {
          sender = {
            id: tech.id,
            username: tech.username,
            fullName: tech.fullName,
            email: (tech as any).email || null,
          };
        }
      }

      return {
        ...msg,
        sender,
      };
    });

    return { ticket, technicians, priorities, notes, initialMessages: enrichedMessages, currentUserId };
  } catch (error) {
    console.error('Error fetching ticket page data:', error);

    // Check if unauthorized
    if (error && typeof error === 'object' && 'status' in error) {
      const statusError = error as { status?: number };
      if (statusError.status === 401) {
        redirect('/login');
      }
      if (statusError.status === 404) {
        redirect('/support-center/requests');
      }
    }

    return null;
  }
}
