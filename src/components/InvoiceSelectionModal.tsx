import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Download, MessageCircle, Mail, MessageSquare, FileText, Loader2, Eye } from "lucide-react";
import { format } from "date-fns";

export interface OrderForInvoice {
  id: string;
  invoice_number?: string;
  total_amount?: number;
  created_at: string;
}

interface InvoiceSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: OrderForInvoice[];
  actionType: 'download' | 'whatsapp' | 'email' | 'sms' | 'view';
  onSelectOrder: (orderId: string) => void;
  onSelectAll?: () => void;
  isLoading?: boolean;
}

export const InvoiceSelectionModal = ({
  open,
  onOpenChange,
  orders,
  actionType,
  onSelectOrder,
  onSelectAll,
  isLoading = false,
}: InvoiceSelectionModalProps) => {
  const [selectedOrderId, setSelectedOrderId] = useState<string>(orders[0]?.id || "");

  const getActionIcon = () => {
    switch (actionType) {
      case 'download':
        return <Download className="h-4 w-4" />;
      case 'whatsapp':
        return <MessageCircle className="h-4 w-4 text-green-600" />;
      case 'email':
        return <Mail className="h-4 w-4 text-blue-600" />;
      case 'sms':
        return <MessageSquare className="h-4 w-4 text-orange-600" />;
      case 'view':
        return <Eye className="h-4 w-4" />;
    }
  };

  const getActionTitle = () => {
    switch (actionType) {
      case 'download':
        return 'Download Invoice';
      case 'whatsapp':
        return 'Share via WhatsApp';
      case 'email':
        return 'Share via Email';
      case 'sms':
        return 'Share via SMS';
      case 'view':
        return 'View Invoice';
    }
  };

  const getActionButtonText = () => {
    switch (actionType) {
      case 'download':
        return 'Download Selected';
      case 'whatsapp':
        return 'Send via WhatsApp';
      case 'email':
        return 'Send via Email';
      case 'sms':
        return 'Send via SMS';
      case 'view':
        return 'View Selected';
    }
  };

  const handleAction = () => {
    if (selectedOrderId) {
      onSelectOrder(selectedOrderId);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getActionIcon()}
            {getActionTitle()}
          </DialogTitle>
          <DialogDescription>
            Multiple orders found for today. Select which invoice to {actionType === 'download' ? 'download' : 'share'}.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          <RadioGroup
            value={selectedOrderId}
            onValueChange={setSelectedOrderId}
            className="space-y-3"
          >
            {orders.map((order) => (
              <div
                key={order.id}
                className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                  selectedOrderId === order.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
                onClick={() => setSelectedOrderId(order.id)}
              >
                <RadioGroupItem value={order.id} id={order.id} />
                <Label
                  htmlFor={order.id}
                  className="flex-1 cursor-pointer flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">
                        {order.invoice_number || `Order #${order.id.slice(0, 8)}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(order.created_at), 'h:mm a')}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm">
                      ₹{(order.total_amount || 0).toLocaleString('en-IN')}
                    </p>
                  </div>
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            onClick={handleAction}
            disabled={!selectedOrderId || isLoading}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                {getActionIcon()}
                <span className="ml-2">{getActionButtonText()}</span>
              </>
            )}
          </Button>
          
          {onSelectAll && orders.length > 1 && actionType === 'download' && (
            <Button
              variant="outline"
              onClick={onSelectAll}
              disabled={isLoading}
              className="w-full"
            >
              <Download className="mr-2 h-4 w-4" />
              Download All ({orders.length} invoices)
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
