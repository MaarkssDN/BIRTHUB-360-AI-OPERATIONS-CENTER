import { useId, type InputHTMLAttributes } from 'react';

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'aria-describedby' | 'aria-invalid'> & {
  label: string;
  hint?: string;
  error?: string;
  id?: string;
};

export function Input({ label, hint, error, id, ...rest }: InputProps) {
  const generated = useId();
  const fieldId = id ?? generated;
  const hintId = hint ? `${fieldId}-dica` : undefined;
  const errorId = error ? `${fieldId}-erro` : undefined;
  const described = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="b360-field">
      <label htmlFor={fieldId}>{label}</label>
      <input
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={described}
        {...rest}
      />
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
