import { Layout } from '@/components/Layout';
import UomQuantityReport from '@/components/reports/UomQuantityReport';

export default function UomQuantityReportPage() {
  return (
    <Layout>
      <div className="p-4 space-y-4 max-w-7xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold">UOM Quantity Report</h1>
          <p className="text-sm text-muted-foreground">
            Per-product sales totals broken down by every unit of measure (KG, Litre, Pieces, etc.).
          </p>
        </div>
        <UomQuantityReport />
      </div>
    </Layout>
  );
}
