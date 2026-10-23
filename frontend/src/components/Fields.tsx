import { createContext, useContext, useEffect, useId, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { parseNumber } from '../lib/numbers';
import type { Step } from '../lib/types';
export const FieldScopeContext = createContext<Step>('system');
export const ValidityContext = createContext<(id: string, invalid: boolean, step?: Step) => void>(
  () => {},
);
export function Numeric({
  label,
  unit,
  value,
  onValue,
  min = -1e9,
  max = 1e9,
  disabled = false,
  compact = false,
}: {
  label: string;
  unit: string;
  value: number;
  onValue: (n: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  compact?: boolean;
}) {
  const id = useId();
  const validity = useContext(ValidityContext);
  const scope = useContext(FieldScopeContext);
  const [raw, setRaw] = useState(String(value));
  const schema = useMemo(
    () =>
      z.object({
        value: z.string().superRefine((s, ctx) => {
          try {
            const n = parseNumber(s);
            if (n < min || n > max)
              ctx.addIssue({ code: 'custom', message: `${min} … ${max} aralığında girin.` });
          } catch {
            ctx.addIssue({ code: 'custom', message: 'Geçerli sayı girin (1,25 veya 1.25).' });
          }
        }),
      }),
    [min, max],
  );
  const { register, setValue } = useForm<{ value: string }>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: { value: raw },
  });
  const binding = register('value');
  const validation = schema.safeParse({ value: raw });
  const message = validation.success ? '' : validation.error.issues[0].message;
  useEffect(() => {
    let current: number;
    try {
      current = parseNumber(raw);
    } catch {
      current = NaN;
    }
    if (current !== value) {
      setRaw(String(value));
      setValue('value', String(value));
    }
  }, [value]);
  useEffect(() => {
    validity(id, !!message && !disabled, scope);
    return () => validity(id, false, scope);
  }, [id, message, disabled, validity, scope]);
  return (
    <label className={'field ' + (compact ? 'compact' : '')} htmlFor={id}>
      <span>
        {label} <small>{unit}</small>
      </span>
      <input
        {...binding}
        id={id}
        type="text"
        inputMode="decimal"
        value={raw}
        disabled={disabled}
        aria-invalid={!!message}
        aria-describedby={message ? id + '-error' : undefined}
        onChange={(e) => {
          setRaw(e.target.value);
          void binding.onChange(e);
          const parsed = schema.safeParse({ value: e.target.value });
          if (parsed.success) onValue(parseNumber(e.target.value));
        }}
        onBlur={(e) => {
          void binding.onBlur(e);
        }}
      />
      {message && (
        <small id={id + '-error'} className="field-error">
          {message}
        </small>
      )}
    </label>
  );
}
export function Select({
  label,
  value,
  onValue,
  children,
}: {
  label: string;
  value: string;
  onValue: (s: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onValue(e.target.value)}>
        {children}
      </select>
    </label>
  );
}
export function Toggle({
  label,
  checked,
  onValue,
}: {
  label: string;
  checked: boolean;
  onValue: (b: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onValue(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
export function VectorFields({
  label,
  unit,
  value,
  onValue,
  min,
}: {
  label: string;
  unit: string;
  value: number[];
  onValue: (a: number[]) => void;
  min?: number;
}) {
  return (
    <div className="field-grid three">
      {value.map((n, i) => (
        <Numeric
          key={i}
          label={label + ' ' + ['X', 'Y', 'Z'][i]}
          unit={unit}
          value={n}
          min={min}
          onValue={(v) => onValue(value.map((x, j) => (i === j ? v : x)))}
        />
      ))}
    </div>
  );
}
