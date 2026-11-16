import { useEffect, useState, type InputHTMLAttributes } from 'react';
import { centsToInput, formatQuantity, parseAmount, parseQuantity } from '@/utils/money';
import { cx } from '@/components/common/ui';

type BaseProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>;

/**
 * Campo de importe en euros con coma decimal. Mantiene el texto mientras se
 * escribe y solo comunica valores válidos (en céntimos).
 */
export function MoneyInput({
  value,
  onChange,
  allowEmpty = false,
  allowNegative = false,
  className,
  ...rest
}: BaseProps & {
  value: number | null;
  onChange: (cents: number | null) => void;
  allowEmpty?: boolean;
  allowNegative?: boolean;
}) {
  const [text, setText] = useState(centsToInput(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(centsToInput(value));
  }, [value, focused]);
  const invalid = text.trim() !== '' && parseAmount(text) === null;
  return (
    <div className="relative">
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        onFocus={(e) => {
          setFocused(true);
          e.currentTarget.select();
        }}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d.,-]/g, '');
          setText(t);
          if (t.trim() === '') {
            if (allowEmpty) onChange(null);
            return;
          }
          const c = parseAmount(t);
          if (c !== null && (allowNegative || c >= 0)) onChange(c);
        }}
        onBlur={() => {
          setFocused(false);
          setText(centsToInput(value));
        }}
        aria-invalid={invalid}
        className={cx('num pr-7 text-right', invalid && 'border-danger-500', className ?? 'field-sm')}
        {...rest}
      />
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[14px] text-ink-faint">€</span>
    </div>
  );
}

export function QuantityInput({
  value,
  onChange,
  className,
  ...rest
}: BaseProps & { value: number; onChange: (q: number) => void }) {
  const [text, setText] = useState(formatQuantity(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(formatQuantity(value));
  }, [value, focused]);
  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={text}
      onFocus={(e) => {
        setFocused(true);
        e.currentTarget.select();
      }}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d.,]/g, '');
        setText(t);
        const q = parseQuantity(t);
        if (q !== null) onChange(q);
      }}
      onBlur={() => {
        setFocused(false);
        setText(formatQuantity(value));
      }}
      className={cx('num text-right', className ?? 'field-sm')}
      {...rest}
    />
  );
}
