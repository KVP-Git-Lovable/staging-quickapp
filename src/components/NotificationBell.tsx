import { useState } from 'react';
import { Bell, CheckCheck, X, History as HistoryIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { useNotifications, type Notification } from '@/hooks/useNotifications';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ReportNotificationDialog } from '@/components/notifications/ReportNotificationDialog';

export function NotificationBell() {
  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead, dismiss } = useNotifications();
  const [openReport, setOpenReport] = useState<Notification | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const navigate = useNavigate();

  const formatTime = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return 'Recently';
    }
  };

  return (
    <>
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white"
          aria-label="Notifications"
        >
          <Bell size={20} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold px-1">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent 
        align="end" 
        className="w-80 p-0"
        sideOffset={8}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold text-sm">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={markAllAsRead}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
        </div>

        <div className="h-[360px] overflow-y-auto overscroll-contain">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              Loading...
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Bell className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={cn(
                    "group relative w-full hover:bg-muted/50 transition-colors",
                    !notification.is_read && "bg-primary/5"
                  )}
                >
                  <button
                    onClick={() => {
                      if (notification.type === 'report_delivery') {
                        // Close the list first — it renders at z-[100] and would
                        // otherwise sit on top of the report dialog and swallow
                        // clicks aimed at the dialog's close button.
                        setPopoverOpen(false);
                        setOpenReport(notification);
                      }
                      if (!notification.is_read) markAsRead(notification.id);
                    }}
                    className="w-full text-left px-4 py-3 pr-9"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "mt-1.5 h-2 w-2 rounded-full flex-shrink-0",
                          notification.is_read ? "bg-transparent" : "bg-primary"
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className={cn(
                            "text-sm leading-tight truncate",
                            notification.is_read ? "font-normal text-muted-foreground" : "font-medium"
                          )}>
                            {notification.title}
                          </p>
                          {(notification.metadata as any)?.is_test && (
                            <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 flex-shrink-0">
                              Test
                            </span>
                          )}
                        </div>
                        {notification.message && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {notification.message}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {formatTime(notification.created_at)}
                        </p>
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      dismiss(notification.id);
                    }}
                    aria-label="Dismiss notification"
                    className="absolute top-2 right-2 p-1 rounded hover:bg-muted text-muted-foreground opacity-60 hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {notifications.length} unread
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => navigate('/notifications/history')}
          >
            <HistoryIcon className="h-3.5 w-3.5" />
            History
          </Button>
        </div>
      </PopoverContent>
    </Popover>
    {/* Rendered outside <Popover> so it isn't part of the popover's dismiss layer */}
    <ReportNotificationDialog notification={openReport} onClose={() => setOpenReport(null)} />
    </>
  );
}
