import { useId, type SelectHTMLAttributes } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'aria-describedby' | 'aria-invalid'> & {
  label: string;
  options: SelectOption[];
  hint?: string;
  error?: string;
  id?: string;
};

export function Select({ label, options, hint, error, id, ...rest }: SelectProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  const hintId = hint ? `${fieldId}-dica` : undefined;
  const errorId = error ? `${fieldId}-erro` : undefined;
  const described = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="b360-field">
      <label htmlFor={fieldId}>{label}</label>
      <div className="b360-select-wrap">
        <select
          id={fieldId}
          className="b360-select"
          aria-invalid={error ? true : undefined}
          aria-describedby={described}
          {...rest}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {hint ? (
        <p id={hintId} className="b360-field-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="b360-field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
