import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSubordinates } from '@/hooks/useSubordinates';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, Users, UserCheck, ChevronDown, X, UserCog } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  setOnBehalfContext,
  clearOnBehalfContext,
  getOnBehalfContext,
} from '@/lib/onBehalfContext';

interface CompactMultiUserSelectorProps {
  selectedUserIds: string[];
  onSelectionChange: (userIds: string[]) => void;
  className?: string;
  includesSelf?: boolean;
  variant?: 'default' | 'onDark';
  showAllTeam?: boolean;
  /**
   * When true, gate for on-behalf ordering:
   * - If operations_config.on_behalf_enabled is true AND user has can('order_on_behalf','view_all'),
   *   the picker lists ALL active users (not just subordinates).
   * - When a single non-self user is selected AND user has can('order_on_behalf','create'),
   *   an on-behalf context is written to sessionStorage for the Cart to consume.
   */
  enableOnBehalf?: boolean;
}

export function CompactMultiUserSelector({
  selectedUserIds,
  onSelectionChange,
  className,
  includesSelf = true,
  variant = 'default',
  showAllTeam = true,
  enableOnBehalf = false,
}: CompactMultiUserSelectorProps) {
  const { user } = useAuth();
  const { subordinates, isLoading, isManager } = useSubordinates();
  const { can } = usePermissions();
  const [searchQuery, setSearchQuery] = useState('');
  const [open, setOpen] = useState(false);

  // Read operations_config.on_behalf_enabled only when the feature is gated on.
  const { data: onBehalfEnabled = false } = useQuery({
    queryKey: ['operations_config', 'on_behalf_enabled'],
    enabled: enableOnBehalf,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from('operations_config')
        .select('on_behalf_enabled')
        .eq('id', 1)
        .maybeSingle();
      return !!(data as any)?.on_behalf_enabled;
    },
  });

  const canViewAll = enableOnBehalf && onBehalfEnabled && can('order_on_behalf', 'view_all');
  const canPlaceOnBehalf = enableOnBehalf && onBehalfEnabled && can('order_on_behalf', 'create');

  // When view_all is on, fetch all active profiles instead of subordinate list.
  const { data: allProfiles = [] } = useQuery({
    queryKey: ['on_behalf_all_profiles'],
    enabled: canViewAll,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('is_active', true)
        .order('full_name', { ascending: true });
      return (data || []) as { id: string; full_name: string }[];
    },
  });

  // Create the list of selectable users.
  // When view_all on-behalf is on, list ALL active profiles; otherwise subordinates.
  const selectableUsers = useMemo(() => {
    const users: { id: string; name: string; level: number }[] = [];

    if (includesSelf && user) {
      users.push({ id: user.id, name: 'My Data', level: 0 });
    }

    if (canViewAll) {
      allProfiles.forEach((p) => {
        if (includesSelf && user && p.id === user.id) return;
        users.push({ id: p.id, name: p.full_name || 'Unknown', level: 1 });
      });
    } else {
      subordinates.forEach((sub) => {
        users.push({
          id: sub.subordinate_user_id,
          name: sub.full_name,
          level: sub.level,
        });
      });
    }

    return users;
  }, [user, subordinates, allProfiles, canViewAll, includesSelf]);

  // Sync on-behalf sessionStorage from current selection.
  useEffect(() => {
    if (!enableOnBehalf || !canPlaceOnBehalf) {
      // Feature off — never manage context. But if this component was granted permission
      // earlier and then lost it, ensure any stale context is cleared for self view.
      if (enableOnBehalf) clearOnBehalfContext();
      return;
    }
    if (
      selectedUserIds.length === 1 &&
      user &&
      selectedUserIds[0] !== user.id
    ) {
      const target = selectableUsers.find((u) => u.id === selectedUserIds[0]);
      if (target) {
        setOnBehalfContext({ userId: target.id, name: target.name });
        return;
      }
    }
    clearOnBehalfContext();
  }, [enableOnBehalf, canPlaceOnBehalf, selectedUserIds, user, selectableUsers]);

  const onBehalfActive =
    enableOnBehalf &&
    canPlaceOnBehalf &&
    selectedUserIds.length === 1 &&
    !!user &&
    selectedUserIds[0] !== user.id;


  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return selectableUsers;
    const query = searchQuery.toLowerCase();
    return selectableUsers.filter(u =>
      u.name.toLowerCase().includes(query)
    );
  }, [selectableUsers, searchQuery]);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleToggleUser = (userId: string) => {
    if (selectedUserIds.includes(userId)) {
      onSelectionChange(selectedUserIds.filter(id => id !== userId));
    } else {
      onSelectionChange([...selectedUserIds, userId]);
    }
  };

  const handleSelectAll = () => {
    const allIds = selectableUsers.map(u => u.id);
    onSelectionChange(allIds);
  };

  const handleDeselectAll = () => {
    onSelectionChange([]);
  };

  const handleSelectSelfOnly = () => {
    if (user) {
      onSelectionChange([user.id]);
    }
  };

  // Get display text for trigger
  const getDisplayText = () => {
    if (selectedUserIds.length === 0) {
      return 'Select';
    }
    if (selectedUserIds.length === 1) {
      if (user && selectedUserIds[0] === user.id) {
        return 'My Data';
      }
      const selected = selectableUsers.find(u => u.id === selectedUserIds[0]);
      return selected?.name || '1 user';
    }
    if (selectedUserIds.length === selectableUsers.length) {
      return 'All Team';
    }
    return `${selectedUserIds.length} users`;
  };

  // Don't show selector if not a manager AND we're not in on-behalf view_all mode
  if (!isManager && !isLoading && !canViewAll) {
    return null;
  }

  if (isLoading) {
    return (
      <div className={cn('h-9 w-28 animate-pulse bg-muted rounded', className)} />
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          size="sm"
          className={cn(
            'justify-between gap-1.5 min-w-[100px] h-7 text-xs px-2',
            variant === 'onDark' && 'bg-background/10 text-primary-foreground border-primary-foreground/20 hover:bg-background/15 focus:ring-primary-foreground/30 backdrop-blur-sm',
            className
          )}
        >
          <div className="flex items-center gap-1.5">
            {onBehalfActive ? (
              <UserCog className="h-3 w-3 shrink-0 text-amber-600" />
            ) : (
              <Users className="h-3 w-3 shrink-0" />
            )}
            <span className="truncate text-xs">{getDisplayText()}</span>
            {onBehalfActive && (
              <Badge
                variant="secondary"
                className="h-4 px-1 text-[9px] bg-amber-100 text-amber-900 border-amber-300"
              >
                on-behalf
              </Badge>
            )}
          </div>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="end">
        <div className="p-3 border-b space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search team members..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          
          {/* Quick actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectSelfOnly}
              className="flex-1 h-7 text-xs"
            >
              My Data
            </Button>
            {showAllTeam && <Button
              variant="outline"
              size="sm"
              onClick={handleSelectAll}
              className="flex-1 h-7 text-xs"
            >
              All Team
            </Button>}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDeselectAll}
              disabled={selectedUserIds.length === 0}
              className="h-7 text-xs px-2"
            >
              Clear
            </Button>
          </div>
        </div>

        {/* User List */}
        <ScrollArea className="h-[250px]">
          <div className="p-2 space-y-1">
            {filteredUsers.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                {searchQuery ? 'No matching team members' : 'No team members found'}
              </div>
            ) : (
              filteredUsers.map((u) => (
                <div
                  key={u.id}
                  className={cn(
                    'flex items-center gap-2 p-2 rounded-md cursor-pointer transition-colors',
                    selectedUserIds.includes(u.id)
                      ? 'bg-primary/10 border border-primary/30'
                      : 'hover:bg-muted/50'
                  )}
                  onClick={() => handleToggleUser(u.id)}
                  style={{ marginLeft: `${Math.max(0, (u.level - 1) * 12)}px` }}
                >
                  <Checkbox
                    checked={selectedUserIds.includes(u.id)}
                    onCheckedChange={() => handleToggleUser(u.id)}
                  />
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-xs">
                      {getInitials(u.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{u.name}</p>
                    {u.level > 0 && (
                      <p className="text-xs text-muted-foreground">Level {u.level}</p>
                    )}
                  </div>
                  {selectedUserIds.includes(u.id) && (
                    <UserCheck className="h-4 w-4 text-primary shrink-0" />
                  )}
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Selected Summary */}
        {selectedUserIds.length > 0 && (
          <div className="p-2 border-t bg-muted/30">
            <div className="flex flex-wrap gap-1">
              {selectedUserIds.slice(0, 3).map((userId) => {
                const u = selectableUsers.find(s => s.id === userId);
                return (
                  <Badge
                    key={userId}
                    variant="secondary"
                    className="gap-1 pr-1 text-xs"
                  >
                    {u?.name || 'Unknown'}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleUser(userId);
                      }}
                      className="ml-0.5 hover:bg-muted rounded p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                );
              })}
              {selectedUserIds.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{selectedUserIds.length - 3} more
                </Badge>
              )}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
