import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PermissionRow {
  name: string;
  label: string;
  parentModule?: string; // only for field/action/widget rows
}

export interface GroupedPermissionRows {
  moduleLabel: string;
  moduleName: string;
  items: PermissionRow[];
}

export interface CRUDFlags {
  can_read: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_view_all: boolean;
  can_modify_all: boolean;
}

export type PermissionMap = Record<string, CRUDFlags>;

interface PermissionLayerTableProps {
  /** Flat list of modules → items (for field/action/widget tabs) or flat rows (for module tab) */
  groups?: GroupedPermissionRows[];
  /** Flat rows — used for the Module tab where no grouping is needed */
  rows?: PermissionRow[];
  permissions: PermissionMap;
  onChange: (name: string, field: keyof CRUDFlags, value: boolean) => void;
  disabled?: boolean;
}

const CRUD_COLS: { key: keyof CRUDFlags; label: string }[] = [
  { key: 'can_read', label: 'Read' },
  { key: 'can_create', label: 'Create' },
  { key: 'can_edit', label: 'Edit' },
  { key: 'can_delete', label: 'Delete' },
  { key: 'can_view_all', label: 'View all' },
  { key: 'can_modify_all', label: 'Modify all' },
];

const ALL_KEYS: (keyof CRUDFlags)[] = ['can_read', 'can_create', 'can_edit', 'can_delete', 'can_view_all', 'can_modify_all'];

function isAllChecked(perms: CRUDFlags | undefined): boolean {
  if (!perms) return false;
  return ALL_KEYS.every(k => perms[k]);
}

function isSomeChecked(perms: CRUDFlags | undefined): boolean {
  if (!perms) return false;
  return ALL_KEYS.some(k => perms[k]);
}


function ItemRow({
  row,
  permissions,
  onChange,
  disabled,
  indent = false,
}: {
  row: PermissionRow;
  permissions: PermissionMap;
  onChange: (name: string, field: keyof CRUDFlags, value: boolean) => void;
  disabled?: boolean;
  indent?: boolean;
}) {
  const perms = permissions[row.name];
  const all = isAllChecked(perms);
  const some = isSomeChecked(perms);

  const handleAll = (checked: boolean) => {
    ALL_KEYS.forEach(k => onChange(row.name, k, checked));
  };

  return (
    <tr className="border-b border-border hover:bg-muted/30 transition-colors">
      <td className={cn('py-2.5 px-4 text-sm text-foreground', indent && 'pl-10')}>
        {row.label}
      </td>
      {/* All column */}
      <td className="py-2.5 px-4 text-center">
        <Checkbox
          checked={all}
          onCheckedChange={(v) => handleAll(!!v)}
          disabled={disabled}
          className={cn(some && !all && 'opacity-60')}
        />
      </td>
      {CRUD_COLS.map(({ key, label }) => (
        <td key={key} className="py-2.5 px-4 text-center">
          <Checkbox
            checked={!!perms?.[key]}
            onCheckedChange={(v) => onChange(row.name, key, !!v)}
            disabled={disabled}
            aria-label={`${row.label} ${label}`}
          />
        </td>
      ))}
    </tr>
  );
}

function GroupHeader({
  group,
  isOpen,
  onToggle,
  permissions,
  onChange,
  disabled,
}: {
  group: GroupedPermissionRows;
  isOpen: boolean;
  onToggle: () => void;
  permissions: PermissionMap;
  onChange: (name: string, field: keyof CRUDFlags, value: boolean) => void;
  disabled?: boolean;
}) {
  // Aggregate CRUD state across all items in the group
  const allItems = group.items.map(i => permissions[i.name]);
  const totalItems = allItems.length;

  const getGroupCrud = (key: keyof CRUDFlags) => {
    const onCount = allItems.filter(p => p?.[key]).length;
    return { allOn: onCount === totalItems, someOn: onCount > 0 };
  };

  const handleGroupAll = (checked: boolean) => {
    group.items.forEach(item => {
      ALL_KEYS.forEach(k => onChange(item.name, k, checked));
    });
  };

  const handleGroupCrud = (key: keyof CRUDFlags, checked: boolean) => {
    group.items.forEach(item => onChange(item.name, key, checked));
  };

  const { allOn: allGroupOn, someOn: someGroupOn } = (() => {
    const counts = CRUD_COLS.map(c => getGroupCrud(c.key));
    return {
      allOn: counts.every(c => c.allOn),
      someOn: counts.some(c => c.someOn),
    };
  })();

  return (
    <tr
      className="bg-muted/50 border-b border-border cursor-pointer select-none hover:bg-muted/70 transition-colors"
      onClick={onToggle}
    >
      <td className="py-2.5 px-4">
        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-sm font-semibold text-foreground">{group.moduleLabel}</span>
        </div>
      </td>
      {/* All column for group */}
      <td className="py-2.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={allGroupOn}
          onCheckedChange={(v) => handleGroupAll(!!v)}
          disabled={disabled}
          className={cn(someGroupOn && !allGroupOn && 'opacity-60')}
        />
      </td>
      {CRUD_COLS.map(({ key }) => {
        const { allOn, someOn } = getGroupCrud(key);
        return (
          <td key={key} className="py-2.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={allOn}
              onCheckedChange={(v) => handleGroupCrud(key, !!v)}
              disabled={disabled}
              className={cn(someOn && !allOn && 'opacity-60')}
            />
          </td>
        );
      })}
    </tr>
  );
}

export const PermissionLayerTable = ({
  groups,
  rows,
  permissions,
  onChange,
  disabled,
}: PermissionLayerTableProps) => {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    // Default all groups open
    const init: Record<string, boolean> = {};
    (groups || []).forEach(g => { init[g.moduleName] = true; });
    return init;
  });

  const toggleGroup = (moduleName: string) => {
    setOpenGroups(prev => ({ ...prev, [moduleName]: !prev[moduleName] }));
  };

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-muted border-b border-border">
            <th className="py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-full">
              Name
            </th>
            <th className="py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center whitespace-nowrap w-12">
              All
            </th>
            {CRUD_COLS.map(({ label }) => (
              <th
                key={label}
                className="py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-center whitespace-nowrap w-16"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Flat rows (Module tab) */}
          {rows?.map(row => (
            <ItemRow
              key={row.name}
              row={row}
              permissions={permissions}
              onChange={onChange}
              disabled={disabled}
            />
          ))}

          {/* Grouped rows (Field / Action / Widget tabs) */}
          {groups?.map(group => (
            <>
              <GroupHeader
                key={`group-${group.moduleName}`}
                group={group}
                isOpen={openGroups[group.moduleName] ?? true}
                onToggle={() => toggleGroup(group.moduleName)}
                permissions={permissions}
                onChange={onChange}
                disabled={disabled}
              />
              {(openGroups[group.moduleName] ?? true) &&
                group.items.map(item => (
                  <ItemRow
                    key={item.name}
                    row={item}
                    permissions={permissions}
                    onChange={onChange}
                    disabled={disabled}
                    indent
                  />
                ))}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
};
