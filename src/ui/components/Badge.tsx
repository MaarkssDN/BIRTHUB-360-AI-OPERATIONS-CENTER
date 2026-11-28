export const HONESTY_STATUSES = ['demo', 'parcial', 'validado', 'bloqueado'] as const;

export type HonestyStatus = (typeof HONESTY_STATUSES)[number];

const LABEL: Record<HonestyStatus, string> = {
  demo: 'Demo',
  parcial: 'Parcial',
  validado: 'Validado',
  bloqueado: 'Bloqueado',
};

const INDEX: Record<HonestyStatus, string> = {
  demo: 'SYN-01',
  parcial: 'SYN-02',
  validado: 'SYN-03',
  bloqueado: 'SYN-04',
};

export function Badge({ status = 'demo' }: { status?: HonestyStatus }) {
  return (
    <span className="b360-badge" data-status={status}>
      <span className="b360-badge-hole" aria-hidden="true" />
      <span className="b360-badge-index">{INDEX[status]}</span>
      {LABEL[status]}
    </span>
  );
}
