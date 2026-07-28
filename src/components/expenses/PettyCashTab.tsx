import React, { useState } from 'react';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Wallet, Plus, Receipt, Eye, Send, IndianRupee, Calendar, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { PettyCashFund, PettyCashLimit, usePettyCashTransactions } from '@/hooks/usePettyCashFund';

const CATEGORIES = ['Stationery', 'Transport', 'Food', 'Courier', 'Printing', 'Misc'];

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  submitted: { label: 'Submitted', variant: 'outline' },
  approved: { label: 'Approved', variant: 'default' },
  rejected: { label: 'Rejected', variant: 'destructive' },
};

interface PettyCashTabProps {
  fund: PettyCashFund;
  limits: PettyCashLimit | null;
}

const PettyCashTab: React.FC<PettyCashTabProps> = ({ fund, limits }) => {
  const { format: fmtMoney } = useCurrency();
  const currencySymbol = fmtMoney(0).replace(/[\d.,\s]/g, '') || '';
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: transactions = [], isLoading } = usePettyCashTransactions(fund.id);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    category: '',
    amount: '',
    description: '',
    transaction_date: format(new Date(), 'yyyy-MM-dd'),
  });

  const spent = fund.allocated_amount - fund.balance;
  const spentPercent = fund.allocated_amount > 0 ? (spent / fund.allocated_amount) * 100 : 0;

  const resetForm = () => {
    setForm({ category: '', amount: '', description: '', transaction_date: format(new Date(), 'yyyy-MM-dd') });
  };

  const validateSpend = (amount: number): string | null => {
    if (amount <= 0) return 'Amount must be greater than 0';
    if (amount > fund.balance) return `Exceeds remaining balance (${fmtMoney(fund.balance)})`;
    if (limits?.max_per_transaction && amount > limits.max_per_transaction) {
      return `Exceeds per-transaction limit (${fmtMoney(limits.max_per_transaction)})`;
    }
    if (limits?.max_per_day) {
      const todayTotal = transactions
        .filter(t => t.transaction_date === form.transaction_date && t.status !== 'rejected')
        .reduce((sum, t) => sum + t.amount, 0);
      if (todayTotal + amount > limits.max_per_day) {
        return `Exceeds daily limit (${fmtMoney(limits.max_per_day)}, already spent ${fmtMoney(todayTotal)} today)`;
      }
    }
    return null;
  };

  const handleSubmit = async (asDraft: boolean) => {
    if (!user?.id || !form.category || !form.amount) {
      toast.error('Please fill category and amount');
      return;
    }
    const amount = parseFloat(form.amount);
    const status = asDraft ? 'draft' : 'submitted';

    if (!asDraft) {
      const err = validateSpend(amount);
      if (err) { toast.error(err); return; }
    }

    if (!asDraft && limits?.require_bill_above && amount > limits.require_bill_above) {
      toast.error(`Bill/proof is required for amounts above ${fmtMoney(limits.require_bill_above)}`);
      return;
    }

    setSaving(true);
    const { error } = await (supabase as any).from('petty_cash_transactions').insert({
      fund_id: fund.id,
      user_id: user.id,
      amount,
      category: form.category,
      description: form.description || null,
      transaction_date: form.transaction_date,
      status,
    });
    setSaving(false);

    if (error) {
      toast.error('Failed to save: ' + error.message);
      return;
    }
    toast.success(asDraft ? 'Saved as draft' : 'Submitted for approval');
    queryClient.invalidateQueries({ queryKey: ['petty-cash-transactions'] });
    queryClient.invalidateQueries({ queryKey: ['petty-cash-fund'] });
    resetForm();
    setShowAddDialog(false);
  };

  const handleSubmitDraft = async (txId: string) => {
    const tx = transactions.find(t => t.id === txId);
    if (!tx) return;
    const err = validateSpend(tx.amount);
    if (err) { toast.error(err); return; }

    const { error } = await (supabase as any)
      .from('petty_cash_transactions')
      .update({ status: 'submitted' })
      .eq('id', txId);
    if (error) { toast.error(error.message); return; }
    toast.success('Submitted');
    queryClient.invalidateQueries({ queryKey: ['petty-cash-transactions'] });
    queryClient.invalidateQueries({ queryKey: ['petty-cash-fund'] });
  };

  return (
    <div className="space-y-4">
      {/* Balance Card */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-background">
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              <span className="font-semibold text-sm text-foreground">Petty Cash Fund</span>
            </div>
            <Badge variant={fund.valid_to ? 'outline' : 'default'} className="text-xs">
              {fund.valid_to ? `Until ${format(new Date(fund.valid_to), 'dd MMM yyyy')}` : 'Ongoing'}
            </Badge>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs text-muted-foreground">Allocated</p>
              <p className="text-lg font-bold text-foreground">{fmtMoney(fund.allocated_amount)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Spent</p>
              <p className="text-lg font-bold text-destructive">{fmtMoney(spent)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Remaining</p>
              <p className="text-lg font-bold text-primary">{fmtMoney(fund.balance)}</p>
            </div>
          </div>
          <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${Math.min(spentPercent, 100)}%` }}
            />
          </div>
          {limits && (
            <div className="mt-2 flex flex-wrap gap-2">
              {limits.max_per_transaction && (
                <Badge variant="outline" className="text-xs">Max/txn: {fmtMoney(limits.max_per_transaction)}</Badge>
              )}
              {limits.max_per_day && (
                <Badge variant="outline" className="text-xs">Max/day: {fmtMoney(limits.max_per_day)}</Badge>
              )}
              {limits.require_bill_above && (
                <Badge variant="outline" className="text-xs">Bill req above: {fmtMoney(limits.require_bill_above)}</Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Spend Button */}
      <Button onClick={() => setShowAddDialog(true)} className="w-full gap-2" size="sm">
        <Plus className="h-4 w-4" /> Record Spend
      </Button>

      {/* Transaction History */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Receipt className="h-4 w-4" /> Transaction History
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {isLoading ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Loading...</p>
          ) : transactions.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No transactions yet</p>
          ) : (
            <div className="space-y-2">
              {transactions.map(tx => (
                <div key={tx.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-card">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{tx.category}</span>
                      <Badge variant={STATUS_MAP[tx.status]?.variant || 'secondary'} className="text-[10px] px-1.5">
                        {STATUS_MAP[tx.status]?.label || tx.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(tx.transaction_date), 'dd MMM')}
                      </span>
                      {tx.description && (
                        <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                          · {tx.description}
                        </span>
                      )}
                    </div>
                    {tx.rejection_reason && (
                      <p className="text-xs text-destructive mt-0.5 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> {tx.rejection_reason}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{fmtMoney(tx.amount)}</span>
                    {tx.status === 'draft' && (
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleSubmitDraft(tx.id)}>
                        <Send className="h-3 w-3" /> Submit
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Spend Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Record Petty Cash Spend</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Category</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Amount ({currencySymbol})</Label>
              <Input
                type="number"
                placeholder="0"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                className="h-10"
              />
            </div>
            <div>
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={form.transaction_date}
                onChange={e => setForm(f => ({ ...f, transaction_date: e.target.value }))}
                className="h-10"
              />
            </div>
            <div>
              <Label className="text-xs">Description (optional)</Label>
              <Textarea
                placeholder="What was this spend for?"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1 h-9 text-xs" onClick={() => handleSubmit(true)} disabled={saving}>
                Save Draft
              </Button>
              <Button className="flex-1 h-9 text-xs gap-1" onClick={() => handleSubmit(false)} disabled={saving}>
                <Send className="h-3 w-3" /> Submit
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PettyCashTab;
