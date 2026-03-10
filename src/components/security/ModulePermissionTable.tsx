import { Checkbox } from '@/components/ui/checkbox';
import { PERMISSION_MODULES } from './permissionModules';

const PERM_COLUMNS = [
  { key: 'all', label: 'All' },
  { key: 'can_read', label: 'View' },
  { key: 'can_create', label: 'Create' },
  { key: 'can_edit', label: 'Edit' },
  { key: 'can_delete', label: 'Delete' },
] as const;

const INDIVIDUAL_FIELDS = ['can_read', 'can_create', 'can_edit', 'can_delete'] as const;

export interface PermissionMap {
  [objectName: string]: {
    can_read: boolean;
    can_create: boolean;
    can_edit: boolean;
    can_delete: boolean;
  };
}

interface ModulePermissionTableProps {
  permissions: PermissionMap;
  onChange: (objectName: string, field: string, value: boolean) => void;
  disabled?: boolean;
}

export const ModulePermissionTable = ({ permissions, onChange, disabled }: ModulePermissionTableProps) => {
  const getVal = (name: string, field: string) => {
    return permissions[name]?.[field as keyof PermissionMap[string]] ?? false;
  };

  const isAllChecked = (name: string) => {
    return INDIVIDUAL_FIELDS.every(f => getVal(name, f));
  };

  const handleAllToggle = (name: string, checked: boolean) => {
    INDIVIDUAL_FIELDS.forEach(f => onChange(name, f, checked));
  };

  // Flatten modules into rows with hierarchy info
  type Row = { name: string; label: string; level: number; isParent: boolean; childNames?: string[] };
  const rows: Row[] = [];

  PERMISSION_MODULES.forEach(mod => {
    // Module-level row (parent)
    const modChildNames: string[] = [];
    mod.features.forEach(feat => {
      if (feat.subFeatures && feat.subFeatures.length > 0) {
        feat.subFeatures.forEach(sf => modChildNames.push(sf.name));
      } else {
        modChildNames.push(feat.name);
      }
    });
    rows.push({ name: mod.name, label: mod.label, level: 0, isParent: true, childNames: modChildNames });

    mod.features.forEach(feat => {
      if (feat.subFeatures && feat.subFeatures.length > 0) {
        // Feature with sub-features (parent)
        const featChildNames = feat.subFeatures.map(sf => sf.name);
        rows.push({ name: feat.name, label: feat.label, level: 1, isParent: true, childNames: featChildNames });
        feat.subFeatures.forEach(sf => {
          rows.push({ name: sf.name, label: sf.label, level: 2, isParent: false });
        });
      } else {
        rows.push({ name: feat.name, label: feat.label, level: 1, isParent: false });
      }
    });
  });

  // For parent rows: compute aggregate
  const isParentAllField = (childNames: string[], field: string) => {
    return childNames.every(cn => getVal(cn, field));
  };

  const isParentAllCheckedAll = (childNames: string[]) => {
    return INDIVIDUAL_FIELDS.every(f => childNames.every(cn => getVal(cn, f)));
  };

  const handleParentFieldToggle = (childNames: string[], field: string, checked: boolean) => {
    childNames.forEach(cn => onChange(cn, field, checked));
  };

  const handleParentAllToggle = (childNames: string[], checked: boolean) => {
    childNames.forEach(cn => {
      INDIVIDUAL_FIELDS.forEach(f => onChange(cn, f, checked));
    });
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[1fr_repeat(5,64px)] bg-muted/50 border-b px-4 py-3">
        <span className="text-sm font-medium text-primary">Module</span>
        {PERM_COLUMNS.map(col => (
          <span key={col.key} className="text-sm font-medium text-primary text-center">{col.label}</span>
        ))}
      </div>

      {/* Rows */}
      <div className="divide-y">
        {rows.map((row) => {
          const pl = row.level === 0 ? 'pl-4' : row.level === 1 ? 'pl-8' : 'pl-12';
          const bg = row.level === 0 ? 'bg-muted/30' : '';
          const fontWeight = row.isParent ? 'font-semibold' : 'font-normal';
          const prefix = row.level >= 1 && !row.isParent ? '└ ' : row.level === 1 && row.isParent ? '' : '';

          return (
            <div key={row.name} className={`grid grid-cols-[1fr_repeat(5,64px)] items-center px-4 py-3 ${bg}`}>
              <span className={`text-sm ${fontWeight} ${pl}`}>
                {prefix}{row.label}
              </span>

              {row.isParent && row.childNames ? (
                <>
                  {/* All column */}
                  <div className="flex justify-center">
                    <Checkbox
                      checked={isParentAllCheckedAll(row.childNames)}
                      onCheckedChange={(checked) => handleParentAllToggle(row.childNames!, checked as boolean)}
                      disabled={disabled}
                    />
                  </div>
                  {/* Individual columns */}
                  {INDIVIDUAL_FIELDS.map(f => (
                    <div key={f} className="flex justify-center">
                      <Checkbox
                        checked={isParentAllField(row.childNames!, f)}
                        onCheckedChange={(checked) => handleParentFieldToggle(row.childNames!, f, checked as boolean)}
                        disabled={disabled}
                      />
                    </div>
                  ))}
                </>
              ) : (
                <>
                  {/* All column */}
                  <div className="flex justify-center">
                    <Checkbox
                      checked={isAllChecked(row.name)}
                      onCheckedChange={(checked) => handleAllToggle(row.name, checked as boolean)}
                      disabled={disabled}
                    />
                  </div>
                  {/* Individual columns */}
                  {INDIVIDUAL_FIELDS.map(f => (
                    <div key={f} className="flex justify-center">
                      <Checkbox
                        checked={getVal(row.name, f)}
                        onCheckedChange={(checked) => onChange(row.name, f, checked as boolean)}
                        disabled={disabled}
                      />
                    </div>
                  ))}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
