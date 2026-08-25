import React, { useState } from 'react';
import { Input } from '@/components/ui/input';

/**
 * A target figure that behaves like an ordinary text box.
 *
 * The stored value is a number, but the field must never be rewritten under the
 * cursor. A controlled input that reformats its value on every keystroke hands
 * React a different string from the one the browser has, and the browser
 * answers by putting the caret back at the end — so a figure like 3,004 could
 * only be retyped from scratch, never corrected a digit at a time. Placing the
 * cursor mid-number and typing threw the cursor to the end on the very first
 * character.
 *
 * While the field is being edited it echoes exactly what was typed. Because the
 * string React renders is the string already in the DOM, the browser is left to
 * do what it normally does: caret position, text selection, backspace, delete,
 * arrow keys, undo and part-typed decimals all behave natively. Nothing rewrites
 * the field mid-edit — not a reformat, and not a value arriving from elsewhere
 * in the page. The formatted number takes over again on blur.
 */

const defaultFormat = (value: number) => new Intl.NumberFormat('en-IN').format(value);

const defaultParse = (raw: string) => {
  const num = parseFloat(raw.replace(/,/g, ''));
  return isNaN(num) ? 0 : num;
};

export interface NumericTargetInputProps
  extends Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'type'> {
  value: number;
  /** Called with the parsed number on every keystroke, as before. */
  onValueChange: (value: number) => void;
  /** How a committed value is displayed once the field is left. */
  format?: (value: number) => string;
  /** How typed text becomes a number. */
  parse?: (raw: string) => number;
  /**
   * Applied to the parsed number before it is committed — Math.round, for a
   * field that only holds whole units. It deliberately does not touch the text
   * on screen, so typing "3004." is not cut short at the decimal point.
   */
  transform?: (value: number) => number;
}

export function NumericTargetInput({
  value,
  onValueChange,
  format = defaultFormat,
  parse = defaultParse,
  transform,
  onChange,
  onBlur,
  ...rest
}: NumericTargetInputProps & { onChange?: never }) {
  // The text as typed, held only while the field is being edited. Null means
  // nothing is being typed and the formatted value should show.
  const [typing, setTyping] = useState<string | null>(null);

  return (
    <Input
      {...rest}
      type="text"
      inputMode="decimal"
      value={typing ?? (value > 0 ? format(value) : '')}
      onChange={event => {
        const raw = event.target.value;
        setTyping(raw);
        const parsed = parse(raw);
        onValueChange(transform ? transform(parsed) : parsed);
      }}
      onBlur={event => {
        setTyping(null);
        onBlur?.(event);
      }}
    />
  );
}
