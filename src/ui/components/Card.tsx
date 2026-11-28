import type { ReactNode } from 'react';

export function Card({
  title,
  children,
  footer,
  headingLevel = 3,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  headingLevel?: 2 | 3;
}) {
  const HeadingTag = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section className="b360-card">
      <HeadingTag>{title}</HeadingTag>
      <div className="b360-card-body">{children}</div>
      {footer}
    </section>
  );
}
