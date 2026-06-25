import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

type RealtimeTable = 'Staff' | 'Khoa' | 'LinenType' | 'Batch' | 'LinenCirculation' | 'LinenDiscardLog' | 'Ticket' | 'TicketItem' | 'User' | 'LinenRecycleProposal'

/**
 * Hook to subscribe to Supabase Realtime changes on one or more tables.
 * Automatically refetches data when any INSERT, UPDATE, or DELETE occurs.
 *
 * @param tables - Array of table names to watch
 * @param onRefresh - Callback function to re-fetch data when changes are detected
 * @param channelName - Unique channel name for this subscription
 */
export function useRealtimeSync(
  tables: RealtimeTable[],
  onRefresh: () => void,
  channelName: string
) {
  useEffect(() => {
    const channel = supabase.channel(channelName)

    // Subscribe to all specified tables
    tables.forEach((table) => {
      channel.on(
        // @ts-ignore – supabase-js types are slightly mismatched for postgres_changes
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          onRefresh()
        }
      )
    })

    channel.subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [channelName]) // Only re-subscribe when channelName changes
}
