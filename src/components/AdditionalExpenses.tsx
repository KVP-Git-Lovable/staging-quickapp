import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Upload, FileText, Camera, ScanLine, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { compressImageFile } from '@/utils/imageCompression';
import { offlineStorage, STORES } from '@/lib/offlineStorage';


interface AdditionalExpensesProps {
  beatId?: string;
  beatName?: string;
  expenseDate?: string;
  editExpenseId?: string;
  onExpensesUpdated?: () => void;
}

interface AdditionalExpense {
  id?: string;
  category: string;
  custom_category?: string;
  amount: number;
  description?: string;
  bill_url?: string;
  bill_file?: File;
  expense_date: string;
  status?: string;
}

const FALLBACK_CATEGORIES = [
  'Telephone Expense',
  'Outlocation travel',
  'Food Expenses',
  'Stay',
  'Other'
];

const STATUS_BADGE_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'Draft', variant: 'secondary' },
  submitted: { label: 'Pending', variant: 'outline' },
  manager_approved: { label: 'Approved', variant: 'default' },
  rejected: { label: 'Rejected', variant: 'destructive' },
  paid: { label: 'Paid', variant: 'default' },
};

const AdditionalExpenses: React.FC<AdditionalExpensesProps> = ({
  beatId,
  beatName,
  expenseDate,
  editExpenseId,
  onExpensesUpdated
}) => {
  const { user, userProfile } = useAuth();
  const [isFormOpen, setIsFormOpen] = useState(true);
  const defaultDate = expenseDate || new Date().toISOString().split('T')[0];
  
  const initialExpense: AdditionalExpense = {
    category: '',
    amount: 0,
    description: '',
    expense_date: defaultDate
  };

  // Pre-load with one empty expense row for direct entry
  const [expenses, setExpenses] = useState<AdditionalExpense[]>([{ ...initialExpense }]);
  const [savedExpenses, setSavedExpenses] = useState<AdditionalExpense[]>([]);
  const [loading, setLoading] = useState(false);
  const [isEditLoading, setIsEditLoading] = useState(false);
  const [totalAmount, setTotalAmount] = useState(0);
  const [applyToAllBeats, setApplyToAllBeats] = useState(false);
  const [dbCategories, setDbCategories] = useState<string[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  // Refs for hidden file inputs
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const cameraInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const scanFileRef = useRef<HTMLInputElement | null>(null);
  const scanCameraRef = useRef<HTMLInputElement | null>(null);

  const expenseCategories = dbCategories.length > 0 ? dbCategories : FALLBACK_CATEGORIES;

  useEffect(() => {
    // Fetch categories from DB
    (supabase as any)
      .from('expense_categories')
      .select('name')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .then(({ data }: any) => {
        if (data && data.length > 0) {
          setDbCategories(data.map((c: any) => c.name));
        }
      });
  }, []);

  useEffect(() => {
    if (editExpenseId && user) {
      loadExpenseForEditing(editExpenseId);
    } else {
      fetchSavedExpenses();
    }
  }, [user, editExpenseId]);

  useEffect(() => {
    const total = [...expenses, ...savedExpenses].reduce((sum, expense) => sum + expense.amount, 0);
    setTotalAmount(total);
  }, [expenses, savedExpenses]);

  const loadExpenseForEditing = async (id: string) => {
    setIsEditLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from('additional_expenses')
        .select('*')
        .eq('id', id)
        .eq('user_id', user?.id)
        .single();
      if (error) throw error;
      if (!data) {
        toast.error('Expense not found');
        return;
      }
      setExpenses([{
        id: data.id,
        category: data.category,
        custom_category: data.custom_category || '',
        amount: data.amount,
        description: data.description || '',
        bill_url: data.bill_url || undefined,
        expense_date: data.expense_date,
        status: data.status,
      }]);
      setSavedExpenses([]);
    } catch (error) {
      console.error('Error loading expense for edit:', error);
      toast.error('Failed to load expense');
    } finally {
      setIsEditLoading(false);
    }
  };

  const fetchSavedExpenses = async () => {
    if (!user) return;

    try {
      let query = (supabase as any)
        .from('additional_expenses')
        .select('*')
        .eq('user_id', user.id);

      if (beatId && expenseDate) {
        query = query.eq('expense_date', expenseDate);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      setSavedExpenses(data || []);
    } catch (error) {
      console.error('Error fetching expenses:', error);
      toast.error('Failed to fetch expenses');
    }
  };

  const addExpenseRow = () => {
    setExpenses([...expenses, { ...initialExpense }]);
  };

  const removeExpenseRow = (index: number) => {
    const newExpenses = expenses.filter((_, i) => i !== index);
    setExpenses(newExpenses);
  };

  const updateExpense = (index: number, field: keyof AdditionalExpense, value: any) => {
    const newExpenses = [...expenses];
    newExpenses[index] = { ...newExpenses[index], [field]: value };
    setExpenses(newExpenses);
  };

  const handleScanBill = async (file: File | null) => {
    if (!file) return;
    setIsScanning(true);
    try {
      // Compress image
      const compressed = await compressImageFile(file, 0.5, 1024);
      const compressedFile = new File([compressed], file.name.replace(/[^a-zA-Z0-9._-]/g, '_'), { type: 'image/jpeg' });

      // Convert to base64
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(compressed);
      });

      // Call scan-bill edge function
      const { data, error } = await supabase.functions.invoke('scan-bill', {
        body: { imageBase64: base64, categories: expenseCategories }
      });

      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }

      // Auto-fill first expense row
      const updated = [...expenses];
      const target = updated[0];
      if (data.category && expenseCategories.includes(data.category)) {
        target.category = data.category;
      }
      if (data.amount && data.amount > 0) {
        target.amount = data.amount;
      }
      if (data.description) {
        target.description = data.description;
      }
      if (data.date) {
        target.expense_date = data.date;
      }
      target.bill_file = compressedFile;
      updated[0] = target;
      setExpenses(updated);

      toast.success('Bill scanned! Review the auto-filled details below.');
    } catch (err) {
      console.error('Scan bill error:', err);
      toast.error('Failed to scan bill. Please fill in manually.');
    } finally {
      setIsScanning(false);
      // Reset file inputs
      if (scanFileRef.current) scanFileRef.current.value = '';
      if (scanCameraRef.current) scanCameraRef.current.value = '';
    }
  };

  const handleFileSelected = async (index: number, file: File | null) => {
    if (file) {
      // Compress image files before setting
      if (file.type.startsWith('image/')) {
        try {
          const compressed = await compressImageFile(file, 0.4, 1024);
          const compressedFile = new File([compressed], file.name, { type: 'image/jpeg' });
          updateExpense(index, 'bill_file', compressedFile);
          toast.success(`Compressed: ${(file.size / 1024).toFixed(0)}KB → ${(compressed.size / 1024).toFixed(0)}KB`);
        } catch {
          updateExpense(index, 'bill_file', file);
        }
      } else {
        updateExpense(index, 'bill_file', file);
      }
    }
  };

  const uploadFile = async (file: File, userId: string): Promise<string | null> => {
    // Sanitize filename: replace spaces and special chars with underscores
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileName = `${userId}/${Date.now()}_${sanitizedName}`;
    
    const { error } = await supabase.storage
      .from('expense-bills')
      .upload(fileName, file, {
        contentType: file.type || 'image/jpeg'
      });

    if (error) {
      console.error('Error uploading file:', error);
      return null;
    }

    return fileName;
  };

  const saveExpenses = async () => {
    if (!user || expenses.length === 0) return;

    // Filter out empty rows
    const validExpenses = expenses.filter(e => e.category && e.amount > 0);
    if (validExpenses.length === 0) {
      toast.error('Please fill in at least one expense with category and amount');
      return;
    }

    setLoading(true);
    try {
      const isOffline = !navigator.onLine;
      let offlineCount = 0;

      const persistExpense = async (payload: any) => {
        // Save locally first for instant display / offline safety
        try {
          await offlineStorage.save(STORES.EXPENSES, { ...payload, cached_at: new Date().toISOString() });
        } catch (e) {
          console.warn('Failed to cache expense locally:', e);
        }

        if (isOffline) {
          await offlineStorage.addToSyncQueue('CREATE_EXPENSE', payload);
          offlineCount++;
          return;
        }

        try {
          const { error } = await (supabase as any)
            .from('additional_expenses')
            .upsert(payload, { onConflict: 'id', ignoreDuplicates: false });
          if (error) throw error;
        } catch (err) {
          console.error('Expense upsert failed, queueing for retry:', err);
          await offlineStorage.addToSyncQueue('CREATE_EXPENSE', payload);
          offlineCount++;
        }
      };

      if (applyToAllBeats && expenseDate) {
        const { data: beatAllowances, error: beatError } = await (supabase as any)
          .from('beat_allowances')
          .select('beat_id, beat_name')
          .eq('user_id', user.id)
          .eq('created_at', expenseDate);

        if (beatError) throw beatError;

        for (const beatAllowance of beatAllowances || []) {
          for (const expense of validExpenses) {
            let billUrl: string | null = null;
            if (expense.bill_file && !isOffline) {
              billUrl = await uploadFile(expense.bill_file, user.id);
            }

            const payload = {
              id: crypto.randomUUID(),
              user_id: user.id,
              category: expense.category,
              custom_category: expense.category === 'Other' ? expense.custom_category : null,
              amount: expense.amount,
              description: `${expense.description} (Applied to ${beatAllowance.beat_name})`,
              bill_url: billUrl,
              expense_date: expense.expense_date,
              status: 'submitted',
              submitted_at: new Date().toISOString(),
            };
            await persistExpense(payload);
          }
        }
      } else {
        for (const expense of validExpenses) {
          let billUrl = expense.bill_url || null;
          if (expense.bill_file && !isOffline) {
            const uploaded = await uploadFile(expense.bill_file, user.id);
            if (uploaded) {
              billUrl = uploaded;
            } else {
              toast.error('Failed to upload bill attachment, expense will be saved without it');
            }
          }

          const expenseData: any = {
            id: expense.id || crypto.randomUUID(),
            user_id: user.id,
            category: expense.category,
            custom_category: expense.category === 'Other' ? expense.custom_category : null,
            amount: expense.amount,
            description: beatName ? `${expense.description} (${beatName})` : expense.description,
            bill_url: billUrl,
            expense_date: expense.expense_date,
            status: 'submitted',
            submitted_at: new Date().toISOString(),
          };

          if (expense.id && !isOffline) {
            // Update existing expense (online path)
            const { error } = await (supabase as any)
              .from('additional_expenses')
              .update(expenseData)
              .eq('id', expense.id);
            if (error) {
              console.error('Expense update failed, queueing for retry:', error);
              await offlineStorage.addToSyncQueue('CREATE_EXPENSE', expenseData);
              offlineCount++;
            }
          } else {
            await persistExpense(expenseData);
          }
        }
      }

      if (offlineCount > 0) {
        toast.success(`Saved offline — ${offlineCount} expense${offlineCount > 1 ? 's' : ''} will sync when online`);
      } else {
        toast.success('Expenses saved & submitted for approval!');
      }

      setExpenses([{ ...initialExpense }]);
      setIsFormOpen(false);
      fetchSavedExpenses();
      
      if (onExpensesUpdated) {
        onExpensesUpdated();
      }
    } catch (error) {
      console.error('Error saving expenses:', error);
      toast.error('Failed to save expenses');
    } finally {
      setLoading(false);
    }
  };

  const deleteSavedExpense = async (expenseId: string) => {
    try {
      // Allow deleting both draft and submitted (user's own)
      const { error } = await (supabase as any)
        .from('additional_expenses')
        .delete()
        .eq('id', expenseId)
        .in('status', ['draft', 'submitted']);

      if (error) throw error;

      toast.success('Expense deleted successfully!');
      fetchSavedExpenses();
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast.error('Failed to delete expense. Only draft/submitted expenses can be deleted.');
    }
  };

  const getStatusBadge = (status: string) => {
    const config = STATUS_BADGE_MAP[status] || { label: status, variant: 'secondary' as const };
    return (
      <Badge variant={config.variant} className="text-[10px] px-1.5 py-0">
        {config.label}
      </Badge>
    );
  };

  return (
    <Card className="w-full border-0 shadow-none sm:border sm:shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between p-3 sm:p-6">
        <CardTitle className="flex items-center gap-1.5 text-sm sm:text-lg">
          <FileText size={16} className="sm:w-5 sm:h-5" />
          Additional Expenses
          {totalAmount > 0 && (
            <span className="text-sm sm:text-lg font-bold text-primary ml-1">₹{totalAmount.toFixed(2)}</span>
          )}
        </CardTitle>
        <Button
          onClick={() => setIsFormOpen(!isFormOpen)}
          variant={isFormOpen ? "outline" : "default"}
          size="sm"
          className="h-7 text-xs px-2"
        >
          {isFormOpen ? 'Cancel' : 'Edit'}
        </Button>
      </CardHeader>

      <CardContent className="p-3 sm:p-6 pt-0">
        {isEditLoading && (
          <div className="space-y-3 mb-4 p-3">
            <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
            <div className="h-9 w-full bg-muted animate-pulse rounded" />
            <div className="grid grid-cols-2 gap-2">
              <div className="h-9 bg-muted animate-pulse rounded" />
              <div className="h-9 bg-muted animate-pulse rounded" />
            </div>
            <div className="h-16 w-full bg-muted animate-pulse rounded" />
          </div>
        )}

        {isFormOpen && !isEditLoading && (
          <div className="space-y-3 mb-4">
            <div className="p-2.5 bg-muted/50 rounded-lg space-y-1">
              <Label className="text-xs font-medium">User: {userProfile?.full_name || 'Loading...'}</Label>
              {beatName && (
                <Label className="text-xs font-medium text-primary block">Beat: {beatName}</Label>
              )}
              {expenseDate && (
                <Label className="text-xs font-medium text-muted-foreground block">Date: {new Date(expenseDate).toLocaleDateString()}</Label>
              )}
            </div>

            {/* AI Scan Bill Section */}
            <div className="p-3 border-2 border-dashed border-primary/30 rounded-lg bg-primary/5 space-y-2">
              <div className="flex items-center gap-2">
                <ScanLine size={16} className="text-primary" />
                <Label className="text-xs font-semibold text-primary">Scan Bill with AI</Label>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Upload or photograph a bill to auto-fill category, amount & description
              </p>
              <input
                type="file"
                accept="image/*"
                ref={scanFileRef}
                onChange={(e) => handleScanBill(e.target.files?.[0] || null)}
                className="hidden"
              />
              <input
                type="file"
                accept="image/*"
                capture="environment"
                ref={scanCameraRef}
                onChange={(e) => handleScanBill(e.target.files?.[0] || null)}
                className="hidden"
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs flex-1 border-primary/30"
                  onClick={() => scanFileRef.current?.click()}
                  disabled={isScanning}
                >
                  <Upload size={12} className="mr-1" />
                  Upload Bill
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs flex-1 border-primary/30"
                  onClick={() => scanCameraRef.current?.click()}
                  disabled={isScanning}
                >
                  <Camera size={12} className="mr-1" />
                  Take Photo
                </Button>
              </div>
              {isScanning && (
                <div className="flex items-center gap-2 p-2 bg-primary/10 rounded-md">
                  <Loader2 size={14} className="animate-spin text-primary" />
                  <span className="text-xs text-primary font-medium">Scanning bill... AI is reading your receipt</span>
                </div>
              )}
            </div>

            {beatId && expenseDate && (
              <div className="flex items-center space-x-2 p-2.5 bg-primary/5 rounded-lg border border-primary/20">
                <Checkbox
                  id="apply-all-beats"
                  checked={applyToAllBeats}
                  onCheckedChange={(checked) => setApplyToAllBeats(checked === true)}
                />
                <Label
                  htmlFor="apply-all-beats"
                  className="text-xs font-medium cursor-pointer"
                >
                  Apply these expenses to all beats for this date
                </Label>
              </div>
            )}

            <div className="space-y-3">
              {expenses.map((expense, index) => (
                <div key={index} className="p-3 border rounded-lg space-y-3">
                  <div className="flex justify-between items-center">
                    <Label className="font-medium text-xs">Expense {index + 1}</Label>
                    {expenses.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeExpenseRow(index)}
                        className="text-destructive hover:text-destructive h-6 w-6 p-0"
                      >
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    <div>
                      <Label htmlFor={`category-${index}`} className="text-xs">Category</Label>
                      <Select 
                        onValueChange={(value) => updateExpense(index, 'category', value)}
                        value={expense.category}
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {expenseCategories.map((category) => (
                            <SelectItem key={category} value={category} className="text-xs">
                              {category}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {expense.category === 'Other' && (
                      <div>
                        <Label htmlFor={`custom-category-${index}`} className="text-xs">Custom Category</Label>
                        <Input
                          id={`custom-category-${index}`}
                          value={expense.custom_category || ''}
                          onChange={(e) => updateExpense(index, 'custom_category', e.target.value)}
                          placeholder="Enter custom category"
                          className="h-9 text-xs"
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label htmlFor={`amount-${index}`} className="text-xs">Amount (₹)</Label>
                        <Input
                          id={`amount-${index}`}
                          type="number"
                          value={expense.amount || ''}
                          onChange={(e) => updateExpense(index, 'amount', parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                          min="0"
                          step="0.01"
                          className="h-9 text-xs"
                        />
                      </div>

                      <div>
                        <Label htmlFor={`date-${index}`} className="text-xs">Date</Label>
                        <Input
                          id={`date-${index}`}
                          type="date"
                          value={expense.expense_date}
                          onChange={(e) => updateExpense(index, 'expense_date', e.target.value)}
                          className="h-9 text-xs"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor={`description-${index}`} className="text-xs">Description</Label>
                      <Textarea
                        id={`description-${index}`}
                        value={expense.description || ''}
                        onChange={(e) => updateExpense(index, 'description', e.target.value)}
                        placeholder="Enter expense description"
                        rows={2}
                        className="text-xs min-h-[60px]"
                      />
                    </div>

                  </div>
                </div>
              ))}

              <Button
                onClick={addExpenseRow}
                variant="outline"
                size="sm"
                className="w-full border-dashed h-8 text-xs"
              >
                <Plus size={14} className="mr-1" />
                Add More Expense
              </Button>
            </div>

            {expenses.some(e => e.category && e.amount > 0) && (
              <div className="flex justify-between items-center pt-3 border-t">
                <div className="text-sm font-semibold">
                  Total: ₹{expenses.reduce((sum, exp) => sum + exp.amount, 0).toFixed(2)}
                </div>
                <Button onClick={saveExpenses} disabled={loading} size="sm" className="h-8 text-xs">
                  {loading ? 'Saving...' : editExpenseId ? 'Update Expense' : 'Save & Submit'}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Saved Expenses List */}
        {savedExpenses.length > 0 && (
          <div className="space-y-2">
            <Label className="font-medium text-xs">Saved Expenses:</Label>
            {savedExpenses.map((expense) => (
              <div key={expense.id} className="flex items-center justify-between p-2.5 bg-muted/30 rounded-lg gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-xs truncate">
                      {expense.category === 'Other' ? expense.custom_category : expense.category}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(expense.expense_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                    </span>
                    {getStatusBadge(expense.status || 'draft')}
                  </div>
                  {expense.description && (
                    <p className="text-[10px] text-muted-foreground truncate">{expense.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="font-bold text-xs">₹{expense.amount}</span>
                  {(!expense.status || expense.status === 'draft' || expense.status === 'submitted') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteSavedExpense(expense.id!)}
                      className="text-destructive hover:text-destructive h-6 w-6 p-0"
                    >
                      <Trash2 size={12} />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            
            <div className="flex justify-end pt-2 border-t">
              <div className="text-sm font-bold">
                Total: ₹{totalAmount.toFixed(2)}
              </div>
            </div>
          </div>
        )}

        {savedExpenses.length === 0 && !isFormOpen && (
          <p className="text-muted-foreground text-center py-3 text-xs">
            No additional expenses recorded. Click "Edit" to add expenses.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default AdditionalExpenses;
