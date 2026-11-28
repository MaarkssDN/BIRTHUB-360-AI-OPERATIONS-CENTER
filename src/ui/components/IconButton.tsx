import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Button } from './Button.tsx';

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> & {
  label: string;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  size?: 'sm' | 'md';
  loading?: boolean;
  children: ReactNode;
};

export function IconButton({ label, className, ...rest }: IconButtonProps) {
  const classes = ['b360-icon-button', className].filter(Boolean).join(' ');
  return <Button className={classes} aria-label={label} {...rest} />;
}
