import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Truck, Package, Plus, Workflow, MapPin } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import CreateSubTab from '@/components/packing/CreateSubTab';
import ViewSubTab from '@/components/packing/ViewSubTab';
import RunSubTab from '@/components/packing/RunSubTab';

interface DistributorContext {
  distributorId: string;
}

export default function DistributorPackingLists() {
  const { distributorId } = useOutletContext<DistributorContext>();
  const [topTab, setTopTab] = useState<'primary' | 'secondary'>('secondary');
  const [subTab, setSubTab] = useState('view');

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <div className="bg-card border-b sticky top-0 z-10">
        <div className="flex items-center justify-between p-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">Packing Lists</h1>
            <p className="text-sm text-muted-foreground">Fulfillment workflow management</p>
          </div>
        </div>

        {/* Primary / Secondary Tabs */}
        <div className="px-4 pb-0">
          <Tabs value={topTab} onValueChange={(v) => { setTopTab(v as 'primary' | 'secondary'); setSubTab('view'); }}>
            <TabsList className="w-full">
              <TabsTrigger value="primary" className="flex-1">
                <Truck className="h-4 w-4 mr-2" />
                Primary (B2D)
              </TabsTrigger>
              <TabsTrigger value="secondary" className="flex-1">
                <Package className="h-4 w-4 mr-2" />
                Secondary (B2R)
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Sub Tabs */}
        <div className="px-4 pt-2 pb-2">
          <Tabs value={subTab} onValueChange={setSubTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="create" className="flex items-center gap-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" />
                Create
              </TabsTrigger>
              <TabsTrigger value="view" className="flex items-center gap-1.5 text-xs">
                <Workflow className="h-3.5 w-3.5" />
                Workflow
              </TabsTrigger>
              <TabsTrigger value="run" className="flex items-center gap-1.5 text-xs">
                <MapPin className="h-3.5 w-3.5" />
                Run
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Content */}
      {subTab === 'create' && (
        <CreateSubTab
          orderType={topTab}
          distributorId={distributorId}
          onPackingListCreated={() => setSubTab('view')}
        />
      )}
      {subTab === 'view' && (
        <ViewSubTab
          orderType={topTab}
          distributorId={distributorId}
          basePath="/distributor-portal/packing-list"
        />
      )}
      {subTab === 'run' && (
        <RunSubTab
          orderType={topTab}
          distributorId={distributorId}
        />
      )}
    </div>
  );
}
