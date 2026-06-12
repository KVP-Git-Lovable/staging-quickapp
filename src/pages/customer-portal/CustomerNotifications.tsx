import { useNavigate, useOutletContext } from 'react-router-dom';
import { useCustomerNotifications } from '@/hooks/useCustomerNotifications';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell, ArrowLeft, CheckCheck, Package } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { CustomerPortalUser } from '@/hooks/useCustomerPortalAuth';

interface ContextType {
  retailer: CustomerPortalUser;
}

const CustomerNotifications = () => {
  const navigate = useNavigate();
  const { retailer } = useOutletContext<ContextType>();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useCustomerNotifications(retailer?.id);

  const formatTime = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return 'Recently';
    }
  };

  const handleNotificationClick = (n: typeof notifications[0]) => {
    markAsRead(n.id);
    if (n.related_table === 'orders' && n.related_id) {
      navigate(`/customer-portal/orders/${n.related_id}`);
    }
  };

  return (
    <div className="px-4 pt-4 pb-24 max-w-lg mx-auto space-y-3">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-foreground">Notifications</h1>
          <p className="text-[11px] text-muted-foreground">{unreadCount} unread</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={markAllAsRead}>
            <CheckCheck className="h-3.5 w-3.5" /> Mark all read
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Bell className="h-12 w-12 mb-3 opacity-30" />
          <p className="text-sm font-medium">No notifications yet</p>
          <p className="text-xs mt-1">You'll be notified when your orders are updated.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <Card
              key={n.id}
              className="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => handleNotificationClick(n)}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Package size={16} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{n.title}</p>
                  {n.message && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-1">{formatTime(n.created_at)}</p>
                </div>
                <div className="mt-1.5 h-2 w-2 rounded-full bg-primary flex-shrink-0" />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default CustomerNotifications;
