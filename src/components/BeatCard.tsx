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
import {
  Users, Calendar, MoreVertical, Edit2, BarChart, Trash2, MapPin, Package,
  Sparkles, CalendarDays, UserPlus, Power, Share2, ShieldCheck, ArrowRightLeft,
  Copy, History as HistoryIcon,
} from 'lucide-react';
import { useBeatMetrics } from '@/hooks/useBeatMetrics';
import { useNavigate } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';

export type BeatAccessType = 'OWNED' | 'CO_OWNER' | 'OPERATIONAL' | 'VIEW_ONLY' | 'COVERAGE';

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
  accessType?: BeatAccessType;
  coverageEndDate?: string | null;
  sharedByName?: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onDetails: () => void;
  onAIInsights: () => void;
  onTransfer?: () => void;
  onDeactivate?: () => void;
  onReactivate?: () => void;
  onShare?: () => void;
  onAssignCoverage?: () => void;
  onTransferOwnership?: () => void;
  onClone?: () => void;
  onHistory?: () => void;
  /** When true bottom button is permanent Delete; when false it is Deactivate */
  isHardDeletable?: boolean;
}

function accessBadge(at: BeatAccessType, coverageEndDate?: string | null) {
  switch (at) {
    case 'OWNED':
      return null; // owner: no badge
    case 'CO_OWNER':
      return <Badge className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-800 border-purple-200">Co-owner</Badge>;
    case 'OPERATIONAL':
      return <Badge className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-800 border-blue-200">Operational</Badge>;
    case 'VIEW_ONLY':
      return <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground">Viewing</Badge>;
    case 'COVERAGE': {
      const label = coverageEndDate
        ? `Covering until ${new Date(coverageEndDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
        : 'Covering';
      return <Badge className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-800 border-amber-200">{label}</Badge>;
    }
  }
}

export function BeatCard({
  beat,
  userId,
  accessType = 'OWNED',
  coverageEndDate,
  sharedByName,
  onEdit,
  onDelete,
  onDetails,
  onAIInsights,
  onTransfer,
  onDeactivate,
  onReactivate,
  onShare,
  onAssignCoverage,
  onTransferOwnership,
  onClone,
  onHistory,
  isHardDeletable,
}: BeatCardProps) {
  const { metrics, loading } = useBeatMetrics(beat.id, userId);
  const navigate = useNavigate();
  const { can } = usePermissions();

  const isActive = beat.is_active !== false;
  const isOwner = accessType === 'OWNED';
  const isCoOwner = accessType === 'CO_OWNER';

  const handleBeatNameClick = () => {
    navigate(`/beat/${beat.id}`);
  };

  // Menu visibility per spec
  const showEdit       = isActive && (isOwner || isCoOwner) && can('action_beat_edit', 'edit');
  const showShare      = isActive && isOwner && !!onShare && can('action_beat_share', 'create');
  const showCoverage   = isActive && isOwner && !!onAssignCoverage && can('action_beat_coverage', 'create');
  const showTransfer   = isActive && isOwner && !!onTransferOwnership && can('action_beat_transfer', 'create');
  const showClone      = isActive && isOwner && !!onClone && can('action_beat_clone', 'create');
  const showHistory    = !!onHistory && can('module_my_beats', 'read');
  const showDeactivate = isActive && isOwner && !!onDeactivate && can('action_beat_delete', 'delete');
  const showReactivate = !isActive && !!onReactivate && can('action_beat_reactivate', 'edit');
  const showDelete     = !isActive && !!onDelete && can('action_beat_delete', 'delete');

  const hasAnyMenuItem =
    showEdit || showShare || showCoverage || showTransfer || showClone ||
    showHistory || showDeactivate || showReactivate || showDelete;

  return (
    <Card className="hover:shadow-lg transition-all duration-200 hover:scale-105">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <CardTitle
              className="text-base leading-tight cursor-pointer hover:text-primary transition-colors truncate"
              onClick={handleBeatNameClick}
            >
              {beat.name}
            </CardTitle>
            {accessType === 'COVERAGE' && coverageEndDate ? (
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Covering until {new Date(coverageEndDate).toLocaleDateString()}
              </div>
            ) : sharedByName ? (
              <div className="text-[11px] text-muted-foreground mt-0.5">
                Shared by {sharedByName}
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 flex-wrap justify-end">
            <Badge variant="default" className="text-[10px] px-1.5 py-0.5 font-medium">
              #{beat.beat_number}
            </Badge>
            {accessBadge(accessType, coverageEndDate)}
            {!isActive && (
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
            {hasAnyMenuItem && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                    <MoreVertical size={14} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {showEdit && (
                    <DropdownMenuItem onClick={onEdit}>
                      <Edit2 size={14} className="mr-2" /> Edit Beat
                    </DropdownMenuItem>
                  )}
                  {showShare && (
                    <DropdownMenuItem onClick={onShare}>
                      <Share2 size={14} className="mr-2" /> Share Beat
                    </DropdownMenuItem>
                  )}
                  {showCoverage && (
                    <DropdownMenuItem onClick={onAssignCoverage}>
                      <ShieldCheck size={14} className="mr-2" /> Assign Coverage
                    </DropdownMenuItem>
                  )}
                  {showTransfer && (
                    <DropdownMenuItem onClick={onTransferOwnership}>
                      <ArrowRightLeft size={14} className="mr-2" /> Transfer Ownership
                    </DropdownMenuItem>
                  )}
                  {showClone && (
                    <DropdownMenuItem onClick={onClone}>
                      <Copy size={14} className="mr-2" /> Clone Beat
                    </DropdownMenuItem>
                  )}
                  {showHistory && (
                    <DropdownMenuItem onClick={onHistory}>
                      <HistoryIcon size={14} className="mr-2" /> View History
                    </DropdownMenuItem>
                  )}
                  {(showDeactivate || showReactivate || showDelete) && <DropdownMenuSeparator />}
                  {showReactivate && (
                    <DropdownMenuItem onClick={onReactivate} className="text-emerald-600">
                      <Power size={14} className="mr-2" /> Reactivate Beat
                    </DropdownMenuItem>
                  )}
                  {showDeactivate && (
                    <DropdownMenuItem onClick={onDeactivate} className="text-orange-600">
                      <Power size={14} className="mr-2" /> Deactivate Beat
                    </DropdownMenuItem>
                  )}
                  {showDelete && (
                    <DropdownMenuItem onClick={onDelete} className="text-destructive">
                      <Trash2 size={14} className="mr-2" /> Delete Beat
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
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
            {isOwner && isActive && can('action_beat_edit', 'edit') && (
              <Button variant="outline" size="sm" className="flex-1" onClick={onEdit}>
                <Edit2 size={14} className="mr-2" />
                Edit
              </Button>
            )}
            <Button variant="outline" size="sm" className="flex-1" onClick={onDetails}>
              <BarChart size={14} className="mr-2" />
              Analytics
            </Button>
            {isOwner && isActive && (
              isHardDeletable && can('action_beat_delete', 'delete') ? (
                <Button variant="destructive" size="sm" className="px-3" onClick={onDelete} title="Permanently delete">
                  <Trash2 size={14} />
                </Button>
              ) : can('action_beat_delete', 'delete') ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="px-3 text-orange-600 border-orange-300 hover:bg-orange-50"
                  onClick={onDeactivate || onDelete}
                  title="Deactivate (history exists)"
                >
                  <Power size={14} />
                </Button>
              ) : null
            )}
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
