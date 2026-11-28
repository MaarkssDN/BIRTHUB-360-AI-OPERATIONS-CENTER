import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { Badge } from './components/Badge.tsx';
import { IconButton } from './components/IconButton.tsx';
import { SkipLink } from './components/SkipLink.tsx';
import { Tooltip } from './components/Tooltip.tsx';
import { Button } from './components/Button.tsx';
import { resolveTheme } from './theme.tsx';

test('o selo sem variante é Demo', () => {
  const markup = renderToStaticMarkup(<Badge />);
  assert.match(markup, /Demo/);
  assert.equal(markup.includes('Validado'), false);
  assert.match(markup, /data-status="demo"/);
});

test('os quatro selos carregam a palavra, não só a cor', () => {
  const markup = renderToStaticMarkup(
    <>
      <Badge status="parcial" />
      <Badge status="validado" />
      <Badge status="bloqueado" />
    </>,
  );
  assert.match(markup, /Parcial/);
  assert.match(markup, /Validado/);
  assert.match(markup, /Bloqueado/);
});

test('o atalho de teclado aponta para o conteúdo', () => {
  const markup = renderToStaticMarkup(<SkipLink />);
  assert.match(markup, /href="#conteudo-principal"/);
  assert.match(markup, /Ir para o conteúdo/);
});

test('o botão de ícone exige nome acessível', () => {
  const markup = renderToStaticMarkup(
    <IconButton label="Atualizar amostra">
      <svg />
    </IconButton>,
  );
  assert.match(markup, /aria-label="Atualizar amostra"/);
});

test('a dica fechada não referencia um alvo ausente', () => {
  const closed = renderToStaticMarkup(
    <Tooltip content="Amostra">{(props) => <Button {...props}>Ver</Button>}</Tooltip>,
  );
  assert.equal(closed.includes('role="tooltip"'), false);
  const open = renderToStaticMarkup(
    <Tooltip content="Amostra" defaultOpen>
      {(props) => <Button {...props}>Ver</Button>}
    </Tooltip>,
  );
  assert.match(open, /role="tooltip"/);
  assert.match(open, /Amostra/);
  assert.match(open, /aria-describedby=/);
});

test('o tema do sistema segue prefers-color-scheme e a escolha explícita vence', () => {
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
});
