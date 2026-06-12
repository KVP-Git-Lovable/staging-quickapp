import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CustomerNotification {
  id: string;
  title: string;
  message: string;
  type: string | null;
  is_read: boolean;
  created_at: string;
  related_table: string | null;
  related_id: string | null;
}

export function useCustomerNotifications(retailerId: string | undefined) {
  const [notifications, setNotifications] = useState<CustomerNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!retailerId) {
      setNotifications([]);
      setIsLoading(false);
      return;
    }

    const { data } = await supabase
      .from('notifications')
      .select('id, title, message, type, is_read, created_at, related_table, related_id')
      .eq('retailer_id', retailerId)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(50);

    setNotifications((data as CustomerNotification[]) || []);
    setIsLoading(false);
  }, [retailerId]);

  const markAsRead = useCallback(async (id: string) => {
    if (!retailerId) return;
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .eq('retailer_id', retailerId);
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, [retailerId]);

  const markAllAsRead = useCallback(async () => {
    if (!retailerId) return;
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('retailer_id', retailerId)
      .eq('is_read', false);
    setNotifications([]);
  }, [retailerId]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Real-time subscription
  useEffect(() => {
    if (!retailerId) return;
    const channel = supabase
      .channel(`customer-notifications-${retailerId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `retailer_id=eq.${retailerId}`,
      }, (payload) => {
        setNotifications(prev => [payload.new as CustomerNotification, ...prev]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [retailerId]);

  return {
    notifications,
    unreadCount: notifications.length,
    isLoading,
    markAsRead,
    markAllAsRead,
    refetch: fetchNotifications,
  };
}
