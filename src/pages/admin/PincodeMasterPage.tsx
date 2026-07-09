 import React from 'react';
 import { Layout } from '@/components/Layout';
 import { Button } from '@/components/ui/button';
 import { ArrowLeft } from 'lucide-react';
 import { useNavigate, Navigate } from 'react-router-dom';
 import { useAdminAccess } from '@/hooks/useAdminAccess';
 import { PincodeMasterLookup } from '@/components/admin/PincodeMasterLookup';
 
 const PincodeMasterPage: React.FC = () => {
   const navigate = useNavigate();
   const { hasAdminAccess, loading } = useAdminAccess();
 
   if (loading) {
     return (
       <Layout>
         <div className="min-h-screen flex items-center justify-center">
           <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
         </div>
       </Layout>
     );
   }
 
   if (!hasAdminAccess) {
     return <Navigate to="/dashboard" replace />;
   }
 
   return (
     <Layout>
       <div className="min-h-screen bg-gradient-subtle p-4">
         <div className="w-full space-y-6">
           {/* Header */}
           <div className="flex items-center gap-4">
             <div className="flex-1">
               <h1 className="text-2xl font-bold text-foreground">Pincode Master</h1>
               <p className="text-muted-foreground">Browse India PIN code reference data</p>
             </div>
           </div>
 
           {/* Lookup Component */}
           <PincodeMasterLookup />
         </div>
       </div>
     </Layout>
   );
 };
 
 export default PincodeMasterPage;