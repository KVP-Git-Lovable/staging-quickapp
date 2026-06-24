ALTER TABLE public.credit_ledger DROP CONSTRAINT credit_ledger_type_check;
ALTER TABLE public.credit_ledger ADD CONSTRAINT credit_ledger_type_check
  CHECK (type = ANY (ARRAY[
    'order_credit','order_cancel','payment','adjustment',
    'cancel_refund','cancel_carry_forward','edit_advance_credit'
  ]));