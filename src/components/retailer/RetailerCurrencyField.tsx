import { Label } from '@/components/ui/label';
import { Lock } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRetailerCurrencyConfig, useRetailerHasTransactions } from '@/hooks/useRetailerCurrency';

const INHERIT = '__inherit__';

interface Props {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  /** Pass the retailer id when editing so the field can lock after transactions. */
  retailerId?: string | null;
  className?: string;
}

export function RetailerCurrencyField({ value, onChange, retailerId, className }: Props) {
  const { data: config } = useRetailerCurrencyConfig();
  const { data: locked } = useRetailerHasTransactions(retailerId);

  if (!config?.multiEnabled) return null;

  const selected = config.options.find((o) => o.code === value);

  return (
    <div className={className}>
      <Label htmlFor="retailer-currency" className="flex items-center gap-1.5">
        Transaction Currency
        {locked && <Lock className="h-3 w-3 text-muted-foreground" />}
      </Label>
      {locked ? (
        <div className="mt-1 rounded-md border bg-muted/40 px-3 py-2 text-sm">
          {selected ? selected.label : `Use default (${config.baseCurrency})`}
          <p className="mt-1 text-xs text-muted-foreground">
            Locked — this retailer has transactions. Changing currency would corrupt their ledger.
          </p>
        </div>
      ) : (
        <>
          <Select
            value={value || INHERIT}
            onValueChange={(v) => onChange(v === INHERIT ? null : v)}
          >
            <SelectTrigger id="retailer-currency" className="mt-1">
              <SelectValue placeholder="Use default (inherit)" />
            </SelectTrigger>
            <SelectContent className="bg-background z-50">
              <SelectItem value={INHERIT}>Use default (inherit)</SelectItem>
              {config.options.map((o) => (
                <SelectItem key={o.code} value={o.code}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">
            The currency this retailer is billed in. Their orders, invoices and outstanding balance are all
            recorded in this currency.
          </p>
        </>
      )}
    </div>
  );
}

export default RetailerCurrencyField;
