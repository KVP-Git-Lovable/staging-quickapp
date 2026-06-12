interface SummaryData {
  available: number;
  reserved: number;
  damaged: number;
  expired: number;
  inTransit: number;
  lowStock: number;
  overstock: number;
  expiringSoon: number;
}

interface Props {
  data: SummaryData;
  loading?: boolean;
}

const NetworkInventorySummary = ({ data, loading }: Props) => {
  const pills = [
    { label: 'Available', value: data.available, bg: 'bg-green-100', text: 'text-green-800' },
    { label: 'Reserved', value: data.reserved, bg: 'bg-amber-100', text: 'text-amber-800' },
    { label: 'Damaged', value: data.damaged, bg: 'bg-red-100', text: 'text-red-800' },
    { label: 'Expired', value: data.expired, bg: 'bg-slate-100', text: 'text-slate-700' },
    { label: 'In Transit', value: data.inTransit, bg: 'bg-blue-100', text: 'text-blue-800' },
    { label: 'Low Stock SKUs', value: data.lowStock, bg: 'bg-orange-100', text: 'text-orange-800' },
    { label: 'Overstock SKUs', value: data.overstock, bg: 'bg-indigo-100', text: 'text-indigo-800' },
    { label: 'Expiring Soon', value: data.expiringSoon, bg: 'bg-rose-100', text: 'text-rose-800' },
  ];

  return (
    <div className="flex flex-wrap gap-3">
      {pills.map((pill) => (
        <div
          key={pill.label}
          className={`${pill.bg} ${pill.text} rounded-lg px-4 py-2.5 flex items-center gap-3 min-w-[170px] shadow-sm`}
        >
          <span className="text-sm font-medium opacity-90">{pill.label}</span>
          <span className="text-xl font-bold ml-auto">
            {loading ? '...' : pill.value.toLocaleString('en-IN')}
          </span>
        </div>
      ))}
    </div>
  );
};

export default NetworkInventorySummary;
