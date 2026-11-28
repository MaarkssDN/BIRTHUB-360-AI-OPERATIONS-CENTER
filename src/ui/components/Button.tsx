import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';
type ButtonSize = 'sm' | 'md';

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  children,
  type = 'button',
  disabled = false,
  className,
  ...rest
}: ButtonProps) {
  const classes = ['b360-button', className].filter(Boolean).join(' ');
  return (
    <button
      type={type}
      className={classes}
      data-variant={variant}
      data-size={size}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      {...rest}
    >
      {children}
      {loading ? <span className="b360-sr">Carregando</span> : null}
    </button>
  );
}
