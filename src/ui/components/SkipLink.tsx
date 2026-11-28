export function SkipLink({ href = '#conteudo-principal' }: { href?: string }) {
  return (
    <a className="b360-skip" href={href}>
      Ir para o conteúdo
    </a>
  );
}
