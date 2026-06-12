interface SummaryData {
  available: number;
  reserved: number;
  damaged: number;
  expired: number;
}

interface InventorySummaryCardsProps {
  data: SummaryData;
  loading?: boolean;
}

const InventorySummaryCards = ({ data, loading }: InventorySummaryCardsProps) => {
  const pills = [
    { label: 'Available Stock', value: data.available, bg: 'bg-green-100', text: 'text-green-800' },
    { label: 'Reserved Stock', value: data.reserved, bg: 'bg-amber-100', text: 'text-amber-800' },
    { label: 'Damaged Stock', value: data.damaged, bg: 'bg-red-100', text: 'text-red-800' },
    { label: 'Expired Stock', value: data.expired, bg: 'bg-slate-100', text: 'text-slate-700' },
  ];

  return (
    <div className="flex flex-wrap gap-3">
      {pills.map((pill) => (
        <div
          key={pill.label}
          className={`${pill.bg} ${pill.text} rounded-lg px-4 py-2.5 flex items-center gap-3 min-w-[180px] shadow-sm`}
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

export default InventorySummaryCards;
