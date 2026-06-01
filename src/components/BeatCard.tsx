import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Users, Calendar, MoreVertical, Edit2, BarChart, Trash2, MapPin, Package, Sparkles, CalendarDays, UserPlus, ArrowRightLeft, Power } from 'lucide-react';
import { useBeatMetrics } from '@/hooks/useBeatMetrics';
import { useNavigate } from 'react-router-dom';

interface BeatCardProps {
  beat: {
    id: string;
    beat_number: number;
    name: string;
    retailer_count: number;
    category?: string;
    created_at: string;
    territory_name?: string;
    owner_name?: string;
    is_active?: boolean;
  };
  userId: string;
  onEdit: () => void;
  onDelete: () => void;
  onDetails: () => void;
  onAIInsights: () => void;
  onTransfer?: () => void;
  onDeactivate?: () => void;
  onReactivate?: () => void;
  /** When true bottom button is permanent Delete; when false it is Deactivate */
  isHardDeletable?: boolean;
}

export function BeatCard({ beat, userId, onEdit, onDelete, onDetails, onAIInsights, onTransfer, onDeactivate, onReactivate, isHardDeletable }: BeatCardProps) {
  const { metrics, loading } = useBeatMetrics(beat.id, userId);
  const navigate = useNavigate();

  const handleBeatNameClick = () => {
    navigate(`/beat/${beat.id}`);
  };

  return (
    <Card className="hover:shadow-lg transition-all duration-200 hover:scale-105">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle 
            className="text-base leading-tight cursor-pointer hover:text-primary transition-colors flex-1"
            onClick={handleBeatNameClick}
          >
            {beat.name}
          </CardTitle>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Badge variant="default" className="text-[10px] px-1.5 py-0.5 font-medium">
              #{beat.beat_number}
            </Badge>
            {beat.is_active === false && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">Inactive</Badge>
            )}
            <Badge
              className={`text-[10px] px-1.5 py-0.5 ${
                beat.retailer_count >= 30 ? 'bg-yellow-100 text-yellow-800' :
                beat.retailer_count >= 20 ? 'bg-gray-100 text-gray-800' :
                beat.retailer_count >= 15 ? 'bg-orange-100 text-orange-800' :
                'bg-amber-100 text-amber-800'
              }`}
            >
              {beat.retailer_count >= 30 ? 'Platinum' :
               beat.retailer_count >= 20 ? 'Silver' :
               beat.retailer_count >= 15 ? 'Gold' : 'Bronze'}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                  <MoreVertical size={14} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {onTransfer && beat.is_active !== false && (
                  <DropdownMenuItem onClick={onTransfer}>
                    <ArrowRightLeft size={14} className="mr-2" />
                    Transfer Beat
                  </DropdownMenuItem>
                )}
                {onDeactivate && beat.is_active !== false && (
                  <DropdownMenuItem onClick={onDeactivate} className="text-orange-600">
                    <Power size={14} className="mr-2" />
                    Deactivate Beat
                  </DropdownMenuItem>
                )}
                {onReactivate && beat.is_active === false && (
                  <DropdownMenuItem onClick={onReactivate} className="text-emerald-600">
                    <Power size={14} className="mr-2" />
                    Reactivate Beat
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Beat Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-2 bg-muted/30 rounded-lg">
            <div className="flex items-center justify-center mb-1">
              <Users size={14} className="text-primary mr-1" />
            </div>
            <div className="text-lg font-bold text-primary">{beat.retailer_count}</div>
            <div className="text-[10px] text-muted-foreground">Retailers</div>
          </div>
          <div className="text-center p-2 bg-muted/30 rounded-lg">
            <div className="flex items-center justify-center mb-1">
              <Calendar size={14} className="text-blue-600 mr-1" />
            </div>
            <div className="text-sm font-bold text-blue-600">
              {loading ? '...' : metrics.lastVisited ? new Date(metrics.lastVisited).toLocaleDateString() : 'Never'}
            </div>
            <div className="text-[10px] text-muted-foreground">Last Visited</div>
          </div>
        </div>

        {/* Additional Metrics */}
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between p-2 bg-muted/20 rounded">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span className="text-xs">Visits/Month:</span>
            </div>
            <span className="font-semibold">{loading ? '...' : metrics.visitsPerMonth}</span>
          </div>
          <div className="flex items-center justify-between p-2 bg-muted/20 rounded">
            <div className="flex items-center gap-2 text-muted-foreground">
              <UserPlus className="h-3 w-3" />
              <span className="text-xs">New retailers (3M):</span>
            </div>
            <span className="font-semibold">{loading ? '...' : metrics.retailersAdded3Months}</span>
          </div>
          <div className="flex items-center justify-between p-2 bg-muted/20 rounded">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Package className="h-3 w-3" />
              <span className="text-xs">Last Visit Value:</span>
            </div>
            <span className="font-semibold">
              {loading ? '...' : metrics.lastVisitOrderValue ? `₹${(metrics.lastVisitOrderValue / 1000).toFixed(1)}K` : '₹0'}
            </span>
          </div>
          {metrics.isRecurring && (
            <div className="flex items-center gap-2 p-2 bg-primary/10 rounded border border-primary/20">
              <CalendarDays className="h-3 w-3 text-primary" />
              <span className="text-xs font-medium text-primary">Recurring: {metrics.recurringDetails}</span>
            </div>
          )}
        </div>

        {/* Territory Info */}
        {beat.territory_name && (
          <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
            <MapPin className="h-4 w-4 text-primary" />
            <span className="text-sm text-muted-foreground">Territory:</span>
            <span className="text-sm font-medium">{beat.territory_name}</span>
          </div>
        )}

        {/* Quick Actions */}
        <div className="space-y-2">
          <Button variant="outline" size="sm" className="w-full" onClick={onAIInsights}>
            <Sparkles size={14} className="mr-2" />
            AI Insights
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={onEdit}>
              <Edit2 size={14} className="mr-2" />
              Edit
            </Button>
            <Button variant="outline" size="sm" className="flex-1" onClick={onDetails}>
              <BarChart size={14} className="mr-2" />
              Analytics
            </Button>
            <Button variant="destructive" size="sm" className="px-3" onClick={onDelete}>
              <Trash2 size={14} />
            </Button>
          </div>
        </div>

        {/* Creation Date & Owner */}
        <div className="text-xs text-muted-foreground pt-2 border-t space-y-1">
          <div>Created: {new Date(beat.created_at).toLocaleDateString()}</div>
          {beat.owner_name && (
            <div className="flex items-center gap-1">
              <Users size={12} />
              <span>Owner: {beat.owner_name}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
