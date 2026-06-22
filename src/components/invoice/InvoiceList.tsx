import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { InvoicePDFGenerator } from "./InvoicePDFGenerator";
import InvoiceStatusBadge from "./InvoiceStatusBadge";

export default function InvoiceList() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInvoices();
  }, []);

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      // Fetch all invoice templates
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching templates:", error);
        throw error;
      }
      
      console.log("Fetched templates:", data);
      setInvoices(data || []);
    } catch (error: any) {
      console.error("Error fetching templates:", error);
      toast.error("Failed to load templates: " + error.message);
    } finally {
      setLoading(false);
    }
  };


  if (loading) {
    return <div className="text-center py-8">Loading invoices...</div>;
  }

// Template selection via localStorage removed to enforce official templates only

  return (
    <Card>
      <CardHeader>
        <CardTitle>All Invoices ({invoices.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice Number</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                  No invoices found.
                </TableCell>
              </TableRow>
            ) : (
              invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell className="font-medium">
                    {invoice.invoice_number || invoice.id}
                  </TableCell>
                  <TableCell className="text-right">
                    <InvoicePDFGenerator 
                      invoiceId={invoice.id}
                      buttonLabel="View"
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
