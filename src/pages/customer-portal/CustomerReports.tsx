import { useOutletContext } from 'react-router-dom';
import { CustomerPortalUser } from '@/hooks/useCustomerPortalAuth';
import CustomerHomeDashboard from '@/components/customer-portal/CustomerHomeDashboard';

interface ContextType {
  retailer: CustomerPortalUser;
  cartCount: number;
}

const CustomerReports = () => {
  const { retailer } = useOutletContext<ContextType>();

  return (
    <div className="px-4 pt-4 pb-24 max-w-lg mx-auto">
      <h1 className="text-lg font-bold mb-4 text-foreground">Reports & Insights</h1>
      <CustomerHomeDashboard retailerId={retailer.id} />
    </div>
  );
};

export default CustomerReports;
