import { useNavigate, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, FileText, ListOrdered, Settings2, Loader2, ReceiptText, Plus } from "lucide-react";
import InvoiceTemplateSelector from "@/components/invoice/InvoiceTemplateSelector";
import AllInvoicesList from "@/components/invoice/AllInvoicesList";
import InvoiceDisplaySettings from "@/components/invoice/InvoiceDisplaySettings";
import CreditNoteList from "@/components/credit-note/CreditNoteList";
import { Layout } from "@/components/Layout";
import { useAdminAccess } from "@/hooks/useAdminAccess";

export default function InvoiceManagement() {
  const { hasAdminAccess, loading } = useAdminAccess();
  const navigate = useNavigate();

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-screen">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!hasAdminAccess) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <Layout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Invoice Management</h1>
            <p className="text-muted-foreground">
              Create and manage GST invoices with templates
            </p>
          </div>
        </div>

        <Tabs defaultValue="display-settings" className="space-y-4">
          <TabsList className="grid w-full max-w-2xl grid-cols-4">
            <TabsTrigger value="display-settings" className="flex items-center gap-2">
              <Settings2 className="h-4 w-4" />
              <span className="hidden sm:inline">Settings</span>
            </TabsTrigger>
            <TabsTrigger value="template" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Template
            </TabsTrigger>
            <TabsTrigger value="invoices" className="flex items-center gap-2">
              <ListOrdered className="h-4 w-4" />
              <span className="hidden sm:inline">Invoices</span>
            </TabsTrigger>
            <TabsTrigger value="credit-notes" className="flex items-center gap-2">
              <ReceiptText className="h-4 w-4" />
              <span className="hidden sm:inline">Credit Notes</span>
              <span className="sm:hidden">CN</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="display-settings">
            <InvoiceDisplaySettings />
          </TabsContent>

          <TabsContent value="template">
            <InvoiceTemplateSelector />
          </TabsContent>

          <TabsContent value="invoices">
            <AllInvoicesList />
          </TabsContent>

          <TabsContent value="credit-notes">
            <div className="flex justify-end mb-4">
              <Button onClick={() => navigate("/credit-note/create")} size="sm">
                <Plus className="h-4 w-4 mr-1" /> New Credit Note
              </Button>
            </div>
            <CreditNoteList />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
