import { AlertTriangle, Clock, TrendingDown, Package2 } from 'lucide-react';

interface Alerts {
  lowStock: number;
  notMoving: number;
  expiringSoon: number;
  overstock: number;
}

interface Props {
  alerts: Alerts;
  onChipClick: (key: 'lowStock' | 'notMoving' | 'expiringSoon' | 'overstock') => void;
}

const NetworkInventoryAlertStrip = ({ alerts, onChipClick }: Props) => {
  const chips = [
    { key: 'lowStock' as const, label: `${alerts.lowStock} low stock`, icon: AlertTriangle, color: 'bg-orange-50 text-orange-800 border-orange-200 hover:bg-orange-100' },
    { key: 'notMoving' as const, label: `${alerts.notMoving} not moving`, icon: TrendingDown, color: 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100' },
    { key: 'expiringSoon' as const, label: `${alerts.expiringSoon} expiring soon`, icon: Clock, color: 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100' },
    { key: 'overstock' as const, label: `${alerts.overstock} overstock`, icon: Package2, color: 'bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100' },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={() => onChipClick(chip.key)}
          className={`${chip.color} border rounded-full px-3 py-1 text-xs font-medium flex items-center gap-1.5 transition-colors`}
        >
          <chip.icon className="h-3.5 w-3.5" />
          {chip.label}
        </button>
      ))}
    </div>
  );
};

export default NetworkInventoryAlertStrip;
