import { useState, useEffect } from 'react';
import { useCurrency } from '@/contexts/CurrencyContext';
import { useOutletContext, useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ArrowLeft, IndianRupee, Plus, Download, FileText, CreditCard } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface OutletContext {
  user: { id: string; full_name: string; role: string; distributor_id: string };
  distributorId: string;
}

interface LedgerEntry {
  id: string;
  transaction_date: string;
  transaction_type: string;
  reference_number: string | null;
  description: string | null;
  debit_amount: number;
  credit_amount: number;
  payment_mode: string | null;
  created_at: string;
}

const RetailerLedgerDetail = () => {
  const { format: fmtMoney } = useCurrency();
  const { retailerId } = useParams<{ retailerId: string }>();
  const { distributorId } = useOutletContext<OutletContext>();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [retailerName, setRetailerName] = useState('');
  const [loading, setLoading] = useState(true);
  const [creditLimit, setCreditLimit] = useState(0);

  useEffect(() => {
    if (distributorId && retailerId) loadData();
  }, [distributorId, retailerId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ledgerRes, retailerRes, creditRes] = await Promise.all([
        supabase
          .from('distributor_retailer_ledger')
          .select('*')
          .eq('distributor_id', distributorId)
          .eq('retailer_id', retailerId)
          .order('transaction_date', { ascending: true })
          .order('created_at', { ascending: true }),
        supabase.from('retailers').select('name').eq('id', retailerId!).single(),
        supabase
          .from('distributor_retailer_credit_limits')
          .select('credit_limit')
          .eq('distributor_id', distributorId)
          .eq('retailer_id', retailerId!)
          .maybeSingle(),
      ]);

      if (ledgerRes.error) throw ledgerRes.error;
      setEntries(ledgerRes.data || []);
      setRetailerName(retailerRes.data?.name || 'Unknown Retailer');
      setCreditLimit(Number(creditRes.data?.credit_limit || 0));
    } catch (err) {
      console.error(err);
      toast.error('Failed to load ledger');
    } finally {
      setLoading(false);
    }
  };

  // Calculate running balances
  let runningBalance = 0;
  const entriesWithBalance = entries.map(e => {
    runningBalance += Number(e.debit_amount) - Number(e.credit_amount);
    return { ...e, balance: runningBalance };
  });

  const totalDebit = entries.reduce((s, e) => s + Number(e.debit_amount), 0);
  const totalCredit = entries.reduce((s, e) => s + Number(e.credit_amount), 0);
  const outstanding = totalDebit - totalCredit;

  const getTypeBadge = (type: string) => {
    const config: Record<string, { label: string; className: string }> = {
      invoice: { label: 'Invoice', className: 'bg-blue-100 text-blue-700' },
      payment: { label: 'Payment', className: 'bg-green-100 text-green-700' },
      credit_note: { label: 'Credit Note', className: 'bg-purple-100 text-purple-700' },
      debit_note: { label: 'Debit Note', className: 'bg-orange-100 text-orange-700' },
      opening_balance: { label: 'Opening Bal', className: 'bg-gray-100 text-gray-700' },
    };
    const c = config[type] || { label: type, className: 'bg-gray-100' };
    return <Badge className={c.className}>{c.label}</Badge>;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/distributor-portal/retailer-ledger')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{retailerName}</h1>
          <p className="text-sm text-muted-foreground">Account Ledger</p>
        </div>
        <Button
          size="sm"
          onClick={() => navigate(`/distributor-portal/collect-payment?retailer=${retailerId}`)}
        >
          <Plus className="h-4 w-4 mr-1" /> Collect Payment
        </Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Total Sales</p>
            <p className="text-lg font-bold">{fmtMoney(totalDebit)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Total Received</p>
            <p className="text-lg font-bold text-green-600">{fmtMoney(totalCredit)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p className={`text-lg font-bold ${outstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {fmtMoney(Math.abs(outstanding))}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Credit Limit</p>
            <p className="text-lg font-bold">
              {creditLimit > 0 ? fmtMoney(creditLimit) : 'Not Set'}
            </p>
            {creditLimit > 0 && outstanding > creditLimit && (
              <Badge variant="destructive" className="text-[10px] mt-1">Exceeded</Badge>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Ledger Table */}
      {loading ? (
        <Card><CardContent className="py-12 flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </CardContent></Card>
      ) : entriesWithBalance.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">No transactions yet</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Ref #</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entriesWithBalance.map(entry => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {format(new Date(entry.transaction_date), 'dd MMM yy')}
                      </TableCell>
                      <TableCell>{getTypeBadge(entry.transaction_type)}</TableCell>
                      <TableCell className="text-sm">{entry.reference_number || '—'}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">
                        {entry.description || '—'}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {Number(entry.debit_amount) > 0
                          ? fmtMoney(Number(entry.debit_amount))
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right text-sm text-green-600">
                        {Number(entry.credit_amount) > 0
                          ? fmtMoney(Number(entry.credit_amount))
                          : '—'}
                      </TableCell>
                      <TableCell className={`text-right text-sm font-medium ${entry.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {fmtMoney(Math.abs(entry.balance))}
                        {entry.balance < 0 && <span className="text-[10px] ml-0.5">CR</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Totals row */}
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell colSpan={4} className="text-right">Totals</TableCell>
                    <TableCell className="text-right">{fmtMoney(totalDebit)}</TableCell>
                    <TableCell className="text-right text-green-600">{fmtMoney(totalCredit)}</TableCell>
                    <TableCell className={`text-right ${outstanding > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {fmtMoney(Math.abs(outstanding))}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default RetailerLedgerDetail;
