import { useNavigate, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Building2, Palette, FileText, Globe, Loader2 } from "lucide-react";
import CompanySettings from "@/components/invoice/CompanySettings";
import HeaderBrandingSettings from "@/components/invoice/HeaderBrandingSettings";
import DocumentSettings from "@/components/invoice/DocumentSettings";
import RegionalSettings from "@/components/RegionalSettings";
import { Layout } from "@/components/Layout";
import { useAdminAccess } from "@/hooks/useAdminAccess";

export default function CompanyProfile() {
  const navigate = useNavigate();
  const { hasAdminAccess, loading } = useAdminAccess();

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
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/admin-controls")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Company Profile</h1>
            <p className="text-muted-foreground">
              Manage company details and branding settings
            </p>
          </div>
        </div>

        <Tabs defaultValue="branding" className="space-y-4">
          <TabsList className="grid w-full max-w-2xl grid-cols-4">
            <TabsTrigger value="branding" className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Header Branding
            </TabsTrigger>
            <TabsTrigger value="details" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Company Details
            </TabsTrigger>
            <TabsTrigger value="documents" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Document Settings
            </TabsTrigger>
            <TabsTrigger value="regional" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Regional
            </TabsTrigger>
          </TabsList>

          <TabsContent value="branding">
            <HeaderBrandingSettings />
          </TabsContent>

          <TabsContent value="details">
            <CompanySettings />
          </TabsContent>

          <TabsContent value="documents">
            <DocumentSettings />
          </TabsContent>

          <TabsContent value="regional">
            <RegionalSettings />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
