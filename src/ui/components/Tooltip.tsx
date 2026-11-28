import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';

interface TriggerProps {
  'aria-describedby'?: string;
  onBlur?: () => void;
  onFocus?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
}

export function Tooltip({
  content,
  children,
  defaultOpen = false,
}: {
  content: string;
  defaultOpen?: boolean;
  children: (props: TriggerProps) => ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <span
      className="b360-tooltip-host"
      onMouseEnter={() => {
        setOpen(true);
      }}
      onMouseLeave={() => {
        setOpen(false);
      }}
    >
      {children({
        'aria-describedby': open ? id : undefined,
        onFocus: () => {
          setOpen(true);
        },
        onBlur: () => {
          setOpen(false);
        },
        onKeyDown: (event) => {
          if (event.key === 'Escape') {
            setOpen(false);
          }
        },
      })}
      {open ? (
        <span role="tooltip" id={id} className="b360-tooltip">
          {content}
        </span>
      ) : null}
    </span>
  );
}
