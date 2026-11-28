import { SkipLink } from './components/SkipLink.tsx';
import { HomeScreen } from './HomeScreen.tsx';
import { StyleGuide } from './StyleGuide.tsx';
import { ThemeControl, ThemeProvider } from './theme.tsx';

export function Shell({ path }: { path: string }) {
  const known = path === '/' || path === '/guia';
  return (
    <ThemeProvider>
      <SkipLink />
      <header className="b360-bar">
        <div className="b360-bar-inner">
          <a className="b360-mark" href="/">
            B360-AOC
          </a>
          <nav className="b360-nav" aria-label="Nesta superfície">
            <a href="/" aria-current={path === '/' ? 'page' : undefined}>
              Central
            </a>
            <a href="/guia" aria-current={path === '/guia' ? 'page' : undefined}>
              Guia
            </a>
          </nav>
          <ThemeControl />
        </div>
      </header>
      <main id="conteudo-principal" className="b360-page">
        {known ? null : <p className="b360-note">Esta rota não faz parte deste corte.</p>}
        {path === '/guia' ? <StyleGuide /> : <HomeScreen />}
      </main>
    </ThemeProvider>
  );
}
