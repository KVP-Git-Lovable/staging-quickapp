import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Package, Search, Eye, MoreVertical, Trash2, Send, Clock,
  PackageCheck, Truck, CheckCircle2, Filter, Calendar, Building2, Loader2,
  HandMetal, Box
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { usePackingList, PackingList } from '@/hooks/usePackingList';

interface Props {
  orderType: 'primary' | 'secondary';
  distributorId?: string;
  basePath?: string; // e.g. '/distributor-portal/packing-list'
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: 'Draft', color: 'bg-muted text-muted-foreground', icon: <Clock className="h-4 w-4" /> },
  picking: { label: 'Picking', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300', icon: <HandMetal className="h-4 w-4" /> },
  packed: { label: 'Packed', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300', icon: <PackageCheck className="h-4 w-4" /> },
  ready: { label: 'Ready', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300', icon: <Box className="h-4 w-4" /> },
  dispatched: { label: 'Dispatched', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300', icon: <Truck className="h-4 w-4" /> },
  delivered: { label: 'Delivered', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300', icon: <CheckCircle2 className="h-4 w-4" /> },
};

export default function ViewSubTab({ orderType, distributorId, basePath }: Props) {
  const navigate = useNavigate();
  const detailPath = basePath || '/packing-list';
  const { loading, fetchPackingLists, updatePackingListStatus, deletePackingList } = usePackingList();
  const [packingLists, setPackingLists] = useState<PackingList[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    loadData();
  }, [statusFilter, distributorId]);

  const loadData = async () => {
    const filters: any = {};
    if (statusFilter !== 'all') filters.status = statusFilter;
    if (distributorId) filters.distributorId = distributorId;
    const lists = await fetchPackingLists(filters);
    setPackingLists((lists || []).filter(l => l.order_type === orderType));
  };

  const filtered = packingLists.filter(pl =>
    pl.packing_list_number?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const stats = {
    total: packingLists.length,
    draft: packingLists.filter(pl => pl.status === 'draft').length,
    picking: packingLists.filter(pl => (pl as any).status === 'picking').length,
    packed: packingLists.filter(pl => pl.status === 'packed').length,
    ready: packingLists.filter(pl => (pl as any).status === 'ready').length,
    dispatched: packingLists.filter(pl => pl.status === 'dispatched').length,
    delivered: packingLists.filter(pl => (pl as any).status === 'delivered').length,
  };

  const handleDelete = async (id: string, distId: string | null) => {
    const success = await deletePackingList(id, distId);
    if (success) setPackingLists(prev => prev.filter(pl => pl.id !== id));
  };

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="p-4 pb-0 grid grid-cols-3 md:grid-cols-7 gap-2">
        {Object.entries(stats).map(([key, value]) => {
          const config = statusConfig[key];
          return (
            <Card key={key} className={`cursor-pointer transition-all ${statusFilter === key ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => setStatusFilter(statusFilter === key ? 'all' : key)}>
              <CardContent className="p-3 text-center">
                <p className="text-xl font-bold">{value}</p>
                <p className="text-[10px] text-muted-foreground capitalize">{key}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <div className="px-4 flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search packing lists..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {Object.entries(statusConfig).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Packing Lists */}
      <div className="px-4 pb-6 space-y-3">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-40" />
              <p className="text-muted-foreground font-medium">No packing lists created yet</p>
              <p className="text-xs text-muted-foreground mt-1">Create packing lists from the Create tab</p>
            </CardContent>
          </Card>
        ) : (
          filtered.map(pl => {
            const config = statusConfig[pl.status] || statusConfig.draft;
            return (
              <Card key={pl.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-muted rounded-lg">{config.icon}</div>
                      <div>
                        <p className="font-medium">{pl.packing_list_number}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">
                            {format(new Date(pl.delivery_date), 'dd MMM yyyy')}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={config.color}>{config.label}</Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`${detailPath}/${pl.id}`)}>
                            <Eye className="h-4 w-4 mr-2" /> View Details
                          </DropdownMenuItem>
                          {pl.status === 'draft' && (
                            <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(pl.id, pl.distributor_id)}>
                              <Trash2 className="h-4 w-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t">
                    <div>
                      <p className="text-xs text-muted-foreground">Items</p>
                      <p className="font-semibold">{pl.total_items}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Value</p>
                      <p className="font-semibold">₹{pl.total_value.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Created</p>
                      <p className="font-semibold text-xs">{pl.created_at ? format(new Date(pl.created_at), 'dd MMM') : '-'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
