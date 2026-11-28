import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { renderToStaticMarkup } from 'react-dom/server';
import { Shell } from '../src/ui/Shell.tsx';

function installDom(dom: JSDOM): void {
  const { window } = dom;
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.window = window;
  globals.document = window.document;
  globals.Node = window.Node;
  globals.Element = window.Element;
  globals.HTMLElement = window.HTMLElement;
  globals.SVGElement = window.SVGElement;
  globals.DocumentFragment = window.DocumentFragment;
}

async function check(path: string): Promise<number> {
  const markup = renderToStaticMarkup(<Shell path={path} />);
  const dom = new JSDOM(
    `<!doctype html><html lang="pt-BR"><head><title>B360-AOC verificação de acessibilidade</title></head><body>${markup}</body></html>`,
    { pretendToBeVisual: true, url: 'http://127.0.0.1/' },
  );
  installDom(dom);
  const axeModule = await import('axe-core');
  const axe = axeModule.default;
  const results = await axe.run(dom.window.document, {
    rules: {
      'color-contrast': { enabled: false },
    },
  });
  if (results.violations.length > 0) {
    console.error(`rota ${path}`);
    for (const violation of results.violations) {
      console.error(`${violation.id}: ${violation.help}`);
      for (const node of violation.nodes) {
        console.error(`  ${node.target.join(' ')} — ${node.failureSummary ?? ''}`);
      }
    }
    return results.violations.length;
  }
  console.log(
    `axe ${path}: 0 violações em ${String(results.passes.length)} regras aprovadas (contraste coberto em src/design/tokens.test.ts).`,
  );
  return 0;
}

const route = process.argv[2];
if (route === undefined) {
  const here = fileURLToPath(import.meta.url);
  for (const path of ['/', '/guia']) {
    const result = spawnSync(process.execPath, ['--import', 'tsx', here, path], { stdio: 'inherit' });
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }
} else {
  const violations = await check(route);
  if (violations > 0) {
    process.exit(1);
  }
}
