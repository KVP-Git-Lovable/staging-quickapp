import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ShieldAlert, AlertTriangle, Lock, Unlock } from 'lucide-react';
import StockActionDialog from './StockActionDialog';

interface StockActionsPanelProps {
  distributorId: string;
  products: { id: string; name: string; unit?: string }[];
  onActionComplete: () => void;
}

const StockActionsPanel = ({ distributorId, products, onActionComplete }: StockActionsPanelProps) => {
  const [activeAction, setActiveAction] = useState<'RESERVE' | 'RELEASE' | 'MARK_DAMAGED' | 'MARK_EXPIRED' | null>(null);

  const actions = [
    { key: 'MARK_DAMAGED' as const, label: 'Mark Damaged', icon: AlertTriangle, className: 'bg-red-100 text-red-800 hover:bg-red-200 border border-red-200' },
    { key: 'MARK_EXPIRED' as const, label: 'Mark Expired', icon: ShieldAlert, className: 'bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-200' },
    { key: 'RESERVE' as const, label: 'Reserve Stock', icon: Lock, className: 'bg-blue-100 text-blue-800 hover:bg-blue-200 border border-blue-200' },
    { key: 'RELEASE' as const, label: 'Release Stock', icon: Unlock, className: 'bg-teal-100 text-teal-800 hover:bg-teal-200 border border-teal-200' },
  ];

  return (
    <>
      <div>
        <h3 className="text-base font-semibold text-foreground mb-3">Stock Actions</h3>
        <div className="flex flex-wrap gap-2">
          {actions.map(a => (
            <Button
              key={a.key}
              className={`h-9 px-4 rounded-md text-xs font-semibold ${a.className}`}
              onClick={() => setActiveAction(a.key)}
            >
              <a.icon className="w-4 h-4 mr-1.5" />
              {a.label}
            </Button>
          ))}
        </div>
      </div>

      {activeAction && (
        <StockActionDialog
          open={!!activeAction}
          onOpenChange={(open) => !open && setActiveAction(null)}
          action={activeAction}
          distributorId={distributorId}
          products={products}
          onSuccess={onActionComplete}
        />
      )}
    </>
  );
};

export default StockActionsPanel;
