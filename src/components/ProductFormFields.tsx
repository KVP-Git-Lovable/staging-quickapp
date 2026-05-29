import React, { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Check, ChevronsUpDown, X, Upload, Image as ImageIcon, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

const daysOfWeek = [
  { value: 'monday', label: 'Monday' },
  { value: 'tuesday', label: 'Tuesday' },
  { value: 'wednesday', label: 'Wednesday' },
  { value: 'thursday', label: 'Thursday' },
  { value: 'friday', label: 'Friday' },
  { value: 'saturday', label: 'Saturday' },
  { value: 'sunday', label: 'Sunday' }
];

const weeksOfMonth = [
  { value: 'week1', label: '1st Week' },
  { value: 'week2', label: '2nd Week' },
  { value: 'week3', label: '3rd Week' },
  { value: 'week4', label: '4th Week' }
];

const monthsOfYear = [
  { value: 'january', label: 'January' },
  { value: 'february', label: 'February' },
  { value: 'march', label: 'March' },
  { value: 'april', label: 'April' },
  { value: 'may', label: 'May' },
  { value: 'june', label: 'June' },
  { value: 'july', label: 'July' },
  { value: 'august', label: 'August' },
  { value: 'september', label: 'September' },
  { value: 'october', label: 'October' },
  { value: 'november', label: 'November' },
  { value: 'december', label: 'December' }
];

interface ProductCategory {
  id: string;
  name: string;
}

interface Territory {
  id: string;
  name: string;
  region: string;
}

interface ProductFormData {
  is_active: boolean;
  sku: string;
  product_number: string;
  name: string;
  description: string;
  category_id: string;
  base_unit: string;
  unit: string;
  conversion_factor: number;
  rate: number;
  closing_stock: number;
  barcode: string;
  barcode_image_url?: string;
  qr_code?: string;
  hsn_code?: string;
  is_focused_product: boolean;
  focused_type?: 'fixed_date' | 'recurring' | 'keep_open';
  focused_due_date: string;
  focused_target_quantity: number;
  focused_territories: string[];
  focused_recurring_config?: {
    days_of_week?: string[];
    weeks_of_month?: string[];
    months_of_year?: string[];
  };
}

interface ProductFormFieldsProps {
  form: ProductFormData;
  categories: ProductCategory[];
  territories: Territory[];
  onFormChange: (updates: Partial<ProductFormData>) => void;
}

export const ProductFormFields: React.FC<ProductFormFieldsProps> = ({
  form,
  categories,
  territories,
  onFormChange
}) => {
  const [territoryComboOpen, setTerritoryComboOpen] = useState(false);
  const [uploadingBarcode, setUploadingBarcode] = useState(false);
  const [recurringType, setRecurringType] = useState<'days' | 'weeks' | 'months'>('days');
  const [uoms, setUoms] = useState<Array<{ id: string; code: string; name: string; category: string | null; is_base: boolean }>>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: enabled } = await supabase
        .from('enabled_units')
        .select('uom_id')
        .eq('enabled', true);
      const ids = (enabled || []).map((e: any) => e.uom_id);
      let query = supabase.from('uom_master').select('id, code, name, category, is_base');
      if (ids.length) query = query.in('id', ids);
      const { data } = await query.order('name');
      if (!cancelled && data) setUoms(data as any);
    })();
    return () => { cancelled = true; };
  }, []);

  const baseUoms = uoms.filter((u) => u.is_base);
  const allUoms = uoms;

  const handleBarcodeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingBarcode(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `barcode_${Date.now()}.${fileExt}`;
      const { data, error} = await supabase.storage
        .from('product-images')
        .upload(fileName, file);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(fileName);

      onFormChange({ barcode_image_url: publicUrl });
    } catch (error) {
      console.error('Error uploading barcode:', error);
    } finally {
      setUploadingBarcode(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Active Status */}
      <div className="flex items-center space-x-2">
        <Checkbox
          id="is_active"
          checked={form.is_active}
          onCheckedChange={(checked) => onFormChange({ is_active: !!checked })}
        />
        <Label htmlFor="is_active">Active</Label>
      </div>

      {/* SKU and Product Number */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="sku">SKU *</Label>
          <Input
            id="sku"
            value={form.sku}
            onChange={(e) => onFormChange({ sku: e.target.value })}
            placeholder="Enter SKU"
            required
          />
        </div>
        <div>
          <Label htmlFor="product_number">
            Manufacturer Code <span className="text-muted-foreground font-normal">(Optional)</span>
          </Label>
          <Input
            id="product_number"
            value={form.product_number}
            onChange={(e) => onFormChange({ product_number: e.target.value })}
            placeholder="e.g. MFG-KG-250"
          />
        </div>
      </div>

      {/* Product Name */}
      <div>
        <Label htmlFor="name">Product Name *</Label>
        <Input
          id="name"
          value={form.name}
          onChange={(e) => onFormChange({ name: e.target.value })}
          placeholder="Enter product name"
          required
        />
      </div>

      {/* Description */}
      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={form.description}
          onChange={(e) => onFormChange({ description: e.target.value })}
          placeholder="Enter product description"
          rows={3}
        />
      </div>

      {/* Category */}
      <div>
        <Label htmlFor="category">Category *</Label>
        <Select value={form.category_id} onValueChange={(value) => onFormChange({ category_id: value })}>
          <SelectTrigger>
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Units and Conversion */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <Label htmlFor="base_unit">Base Unit</Label>
          <Select value={form.base_unit} onValueChange={(value) => onFormChange({ base_unit: value })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(baseUoms.length ? baseUoms : allUoms).map((u) => (
                <SelectItem key={u.id} value={u.code.toLowerCase()}>
                  {u.name} ({u.code})
                </SelectItem>
              ))}
              {/* Fallback if user has a legacy value not in master */}
              {!allUoms.some((u) => u.code.toLowerCase() === form.base_unit) && form.base_unit && (
                <SelectItem value={form.base_unit}>{form.base_unit}</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="unit">Unit *</Label>
          <Select value={form.unit} onValueChange={(value) => onFormChange({ unit: value })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allUoms.map((u) => (
                <SelectItem key={u.id} value={u.code.toLowerCase()}>
                  {u.name} ({u.code})
                </SelectItem>
              ))}
              {!allUoms.some((u) => u.code.toLowerCase() === form.unit) && form.unit && (
                <SelectItem value={form.unit}>{form.unit}</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="conversion_factor">Conversion Factor</Label>
          <Input
            id="conversion_factor"
            type="number"
            step="0.01"
            value={form.conversion_factor}
            onChange={(e) => onFormChange({ conversion_factor: parseFloat(e.target.value) || 1 })}
            placeholder="1"
          />
        </div>
      </div>

      {/* Rate and Stock */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="rate">Rate (₹) *</Label>
          <Input
            id="rate"
            type="number"
            step="0.01"
            value={form.rate}
            onChange={(e) => onFormChange({ rate: parseFloat(e.target.value) || 0 })}
            placeholder="0.00"
            required
          />
        </div>
        <div>
          <Label htmlFor="closing_stock">Closing Stock</Label>
          <Input
            id="closing_stock"
            type="number"
            value={form.closing_stock}
            onChange={(e) => onFormChange({ closing_stock: parseInt(e.target.value) || 0 })}
            placeholder="0"
          />
        </div>
      </div>

      {/* HSN/SAC Code */}
      <div>
        <Label htmlFor="hsn_code">HSN/SAC Code</Label>
        <Input
          id="hsn_code"
          value={form.hsn_code || ''}
          onChange={(e) => onFormChange({ hsn_code: e.target.value })}
          placeholder="Enter HSN/SAC code"
        />
      </div>

      {/* Barcode Upload */}
      <div>
        <Label htmlFor="barcode_upload">Barcode Image</Label>
        <div className="flex items-center gap-2">
          <Input
            id="barcode_upload"
            type="file"
            accept="image/*"
            onChange={handleBarcodeUpload}
            disabled={uploadingBarcode}
            className="flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={uploadingBarcode}
          >
            {uploadingBarcode ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
          </Button>
        </div>
        {form.barcode_image_url && (
          <div className="mt-2">
            <img src={form.barcode_image_url} alt="Barcode" className="h-20 object-contain border rounded" />
          </div>
        )}
      </div>

      {/* QR Code Display */}
      {form.qr_code && (
        <div>
          <Label>QR Code (Auto-generated)</Label>
          <div className="mt-2">
            <img src={form.qr_code} alt="QR Code" className="h-32 w-32 border rounded" />
          </div>
        </div>
      )}

      {/* Focused Product Section */}
      <div className="space-y-4 pt-4 border-t">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="is_focused_product"
            checked={form.is_focused_product}
            onCheckedChange={(checked) => onFormChange({ is_focused_product: !!checked })}
          />
          <Label htmlFor="is_focused_product" className="font-semibold">
            Mark as Focused Product
          </Label>
        </div>

        {form.is_focused_product && (
          <div className="space-y-4 pl-6 border-l-2 border-primary/20">
            <div className="flex items-center gap-2">
              <Label className="font-semibold">Focused Product Schedules</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-sm">Choose how to schedule this focused product</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <RadioGroup
              value={form.focused_type}
              onValueChange={(value) => onFormChange({ focused_type: value as 'fixed_date' | 'recurring' | 'keep_open' })}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="fixed_date" id="fixed_date" />
                <Label htmlFor="fixed_date" className="cursor-pointer flex items-center gap-1">
                  Fixed Date
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">One-time campaign with specific end date</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="recurring" id="recurring" />
                <Label htmlFor="recurring" className="cursor-pointer flex items-center gap-1">
                  Recurring
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">Automated schedule based on selected pattern</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="keep_open" id="keep_open" />
                <Label htmlFor="keep_open" className="cursor-pointer flex items-center gap-1">
                  Keep it Open
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-3 w-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">No expiry date, active until manually disabled</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
              </div>
            </RadioGroup>

            {/* Fixed Date Configuration */}
            {form.focused_type === 'fixed_date' && (
              <div className="space-y-4 pl-6 border-l-2 border-primary/20">
                <div>
                  <Label htmlFor="focused_due_date">Due Date</Label>
                  <Input
                    id="focused_due_date"
                    type="date"
                    value={form.focused_due_date}
                    onChange={(e) => onFormChange({ focused_due_date: e.target.value })}
                    required
                  />
                </div>
              </div>
            )}

            {/* Recurring Configuration */}
            {form.focused_type === 'recurring' && (
              <div className="space-y-4 pl-6 border-l-2 border-primary/20">
                <div>
                  <Label className="font-medium">Recurring Pattern</Label>
                  <RadioGroup
                    value={recurringType}
                    onValueChange={(value) => setRecurringType(value as 'days' | 'weeks' | 'months')}
                    className="mt-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="days" id="days" />
                      <Label htmlFor="days" className="cursor-pointer">Days of Week</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="weeks" id="weeks" />
                      <Label htmlFor="weeks" className="cursor-pointer">Weeks of Month</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="months" id="months" />
                      <Label htmlFor="months" className="cursor-pointer">Months of Year</Label>
                    </div>
                  </RadioGroup>
                </div>

                {recurringType === 'days' && (
                  <div>
                    <Label>Select Days</Label>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {daysOfWeek.map(day => (
                        <div key={day.value} className="flex items-center space-x-2">
                          <Checkbox
                            id={`day-${day.value}`}
                            checked={form.focused_recurring_config?.days_of_week?.includes(day.value)}
                            onCheckedChange={(checked) => {
                              const current = form.focused_recurring_config?.days_of_week || [];
                              const updated = checked
                                ? [...current, day.value]
                                : current.filter(d => d !== day.value);
                              onFormChange({
                                focused_recurring_config: {
                                  days_of_week: updated,
                                  weeks_of_month: [],
                                  months_of_year: []
                                }
                              });
                            }}
                          />
                          <Label htmlFor={`day-${day.value}`} className="cursor-pointer text-sm">
                            {day.label}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {recurringType === 'weeks' && (
                  <div>
                    <Label>Select Weeks</Label>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {weeksOfMonth.map(week => (
                        <div key={week.value} className="flex items-center space-x-2">
                          <Checkbox
                            id={`week-${week.value}`}
                            checked={form.focused_recurring_config?.weeks_of_month?.includes(week.value)}
                            onCheckedChange={(checked) => {
                              const current = form.focused_recurring_config?.weeks_of_month || [];
                              const updated = checked
                                ? [...current, week.value]
                                : current.filter(w => w !== week.value);
                              onFormChange({
                                focused_recurring_config: {
                                  days_of_week: [],
                                  weeks_of_month: updated,
                                  months_of_year: []
                                }
                              });
                            }}
                          />
                          <Label htmlFor={`week-${week.value}`} className="cursor-pointer text-sm">
                            {week.label}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {recurringType === 'months' && (
                  <div>
                    <Label>Select Months</Label>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      {monthsOfYear.map(month => (
                        <div key={month.value} className="flex items-center space-x-2">
                          <Checkbox
                            id={`month-${month.value}`}
                            checked={form.focused_recurring_config?.months_of_year?.includes(month.value)}
                            onCheckedChange={(checked) => {
                              const current = form.focused_recurring_config?.months_of_year || [];
                              const updated = checked
                                ? [...current, month.value]
                                : current.filter(m => m !== month.value);
                              onFormChange({
                                focused_recurring_config: {
                                  days_of_week: [],
                                  weeks_of_month: [],
                                  months_of_year: updated
                                }
                              });
                            }}
                          />
                          <Label htmlFor={`month-${month.value}`} className="cursor-pointer text-sm">
                            {month.label}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Target Quantity - shown for all types */}
            <div>
              <Label htmlFor="focused_target_quantity">Target Quantity</Label>
              <Input
                id="focused_target_quantity"
                type="number"
                value={form.focused_target_quantity}
                onChange={(e) => onFormChange({ focused_target_quantity: parseInt(e.target.value) || 0 })}
                placeholder="Enter target quantity"
              />
            </div>

            {/* Territories Multi-select - shown for all types */}
            <div>
              <Label>Territories</Label>
              <Popover open={territoryComboOpen} onOpenChange={setTerritoryComboOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={territoryComboOpen}
                    className="w-full justify-between"
                  >
                    {form.focused_territories.length > 0
                      ? `${form.focused_territories.length} selected`
                      : "Select territories..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0">
                  <Command>
                    <CommandInput placeholder="Search territories..." />
                    <CommandList>
                      <CommandEmpty>No territory found.</CommandEmpty>
                      <CommandGroup>
                        {territories.map((territory) => (
                          <CommandItem
                            key={territory.id}
                            value={territory.name}
                            onSelect={() => {
                              const isSelected = form.focused_territories.includes(territory.id);
                              const updated = isSelected
                                ? form.focused_territories.filter(id => id !== territory.id)
                                : [...form.focused_territories, territory.id];
                              onFormChange({ focused_territories: updated });
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                form.focused_territories.includes(territory.id) ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {territory.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {form.focused_territories.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {form.focused_territories.map((id) => {
                    const territory = territories.find(t => t.id === id);
                    return territory ? (
                      <Badge key={id} variant="secondary" className="gap-1">
                        {territory.name}
                        <X
                          className="h-3 w-3 cursor-pointer"
                          onClick={() => onFormChange({
                            focused_territories: form.focused_territories.filter(tid => tid !== id)
                          })}
                        />
                      </Badge>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
