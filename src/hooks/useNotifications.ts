import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string | null;
  is_read: boolean;
  created_at: string;
  read_at?: string | null;
  related_table: string | null;
  related_id: string | null;
  metadata?: Record<string, any> | null;
}

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [pendingBanner, setPendingBanner] = useState<Notification | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) {
      setNotifications([]);
      setPendingBanner(null);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_read', false)
        .is('deleted_at', null)
        .or('target_portal.is.null,target_portal.eq.field_sales_app')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching notifications:', error);
        return;
      }

      const all = (data || []) as Notification[];
      const banners = all.filter(n => n.type === 'leaderboard_banner');
      const rest = all.filter(n => n.type !== 'leaderboard_banner');
      setNotifications(rest);
      // Only show a banner that has not been dismissed/read yet, otherwise it
      // re-appears on every page refresh.
      setPendingBanner(banners.find(n => !n.is_read) ?? null);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  // Marking as read moves the notification out of the active list and into
  // history (read_at is stamped by a database trigger).
  const markAsRead = useCallback(async (id: string) => {
    if (!user?.id) return;
    const snapshot = notifications;
    setNotifications(prev => prev.filter(n => n.id !== id));

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error marking notification as read:', error);
      setNotifications(snapshot);
    }
  }, [user?.id, notifications]);

  const dismiss = useCallback(async (id: string) => {
    if (!user?.id) return;
    const snapshot = notifications;
    setNotifications(p => p.filter(n => n.id !== id));
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, is_dismissed: true })
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
    } catch (e) {
      console.error('Error dismissing notification:', e);
      setNotifications(snapshot);
    }
  }, [user?.id, notifications]);

  const markAllAsRead = useCallback(async () => {
    if (!user?.id) return;
    const snapshot = notifications;
    setNotifications([]);

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (error) {
      console.error('Error marking all notifications as read:', error);
      setNotifications(snapshot);
    }
  }, [user?.id, notifications]);

  const dismissBanner = useCallback(async () => {
    setPendingBanner(null);
    if (!user?.id) return;
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user.id)
        .eq('type', 'leaderboard_banner')
        .eq('is_read', false)
        .or('target_portal.is.null,target_portal.eq.field_sales_app');

      if (error) {
        console.error('Error dismissing banner:', error);
      }
    } catch (e) {
      console.error('Error dismissing banner:', e);
    }
  }, [user?.id]);

  const unreadCount = notifications.length;

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Real-time subscription
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel('notifications-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const n = payload.new as Notification;
          if (n.type === 'leaderboard_banner') {
            setPendingBanner(n);
          } else {
            setNotifications(prev => [n, ...prev]);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    dismiss,
    markAllAsRead,
    pendingBanner,
    dismissBanner,
    refetch: fetchNotifications,
  };
}

export function useNotificationHistory() {
  const { user } = useAuth();
  const [history, setHistory] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    if (!user?.id) {
      setHistory([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_read', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(2000);

    if (error) console.error('Error fetching notification history:', error);
    setHistory((data || []) as Notification[]);
    setIsLoading(false);
  }, [user?.id]);

  const remove = useCallback(async (id: string) => {
    if (!user?.id) return;
    const snapshot = history;
    setHistory(prev => prev.filter(n => n.id !== id));
    const { error } = await supabase
      .from('notifications')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id);
    if (error) {
      console.error('Error deleting notification:', error);
      setHistory(snapshot);
    }
  }, [user?.id, history]);

  const clearAll = useCallback(async () => {
    if (!user?.id) return;
    const snapshot = history;
    setHistory([]);
    const { error } = await supabase
      .from('notifications')
      .update({ deleted_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('is_read', true)
      .is('deleted_at', null);
    if (error) {
      console.error('Error clearing notification history:', error);
      setHistory(snapshot);
    }
  }, [user?.id, history]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  return { history, isLoading, remove, clearAll, refetch: fetchHistory };
}
