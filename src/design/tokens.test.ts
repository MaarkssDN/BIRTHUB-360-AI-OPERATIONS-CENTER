import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  DESIGN_TOKENS,
  TEXT_CONTRAST_MIN,
  TEXT_PAIRS,
  UI_CONTRAST_MIN,
  UI_PAIRS,
  contrastRatio,
  isInGamut,
  isThemeColor,
  parseCustomProperties,
  tokenValue,
} from './tokens.ts';

function marked(css: string, name: string): string {
  const start = `/* ${name} */`;
  const end = `/* /${name} */`;
  const from = css.indexOf(start);
  const to = css.indexOf(end);
  assert.ok(from >= 0 && to > from, name);
  return css.slice(from + start.length, to);
}

const css = fs.readFileSync(new URL('../ui/tokens.css', import.meta.url), 'utf8');
const light = parseCustomProperties(marked(css, 'light'));
const dark = parseCustomProperties(marked(css, 'dark'));
const systemDark = parseCustomProperties(marked(css, 'dark-system'));

test('o inventário reproduz as custom properties dos dois temas', () => {
  for (const token of DESIGN_TOKENS) {
    assert.equal(light[token.name], token.light, token.name);
    if (token.dark === token.light) {
      assert.equal(dark[token.name], undefined, `${token.name} não deveria repetir no escuro`);
    } else {
      assert.equal(dark[token.name], token.dark, token.name);
      assert.equal(systemDark[token.name], token.dark, `${token.name} em prefers-color-scheme`);
    }
  }
  assert.deepEqual(systemDark, dark);
});

test('preto sobre branco continua 21:1 e o branco oklch fecha o mesmo par', () => {
  const hex = contrastRatio('#000000', '#ffffff');
  assert.ok(Math.abs(hex - 21) < 0.01, String(hex));
  const oklch = contrastRatio('oklch(0 0 0)', 'oklch(1 0 0)');
  assert.ok(oklch > 20, String(oklch));
});

test('cores dos dois temas ficam dentro do sRGB', () => {
  for (const token of DESIGN_TOKENS) {
    if (!isThemeColor(token.light)) {
      continue;
    }
    assert.equal(isInGamut(token.light), true, `${token.name} claro`);
    assert.equal(isInGamut(token.dark), true, `${token.name} escuro`);
  }
});

test('não há lacuna de contraste: texto ≥ 4,5:1 e interface ≥ 3:1 nos dois temas', () => {
  for (const theme of ['light', 'dark'] as const) {
    for (const pair of TEXT_PAIRS) {
      const ratio = contrastRatio(tokenValue(pair.fg, theme), tokenValue(pair.bg, theme));
      assert.ok(ratio >= TEXT_CONTRAST_MIN, `${theme} ${pair.label} = ${ratio.toFixed(2)}`);
    }
    for (const pair of UI_PAIRS) {
      const ratio = contrastRatio(tokenValue(pair.fg, theme), tokenValue(pair.bg, theme));
      assert.ok(ratio >= UI_CONTRAST_MIN, `${theme} ${pair.label} = ${ratio.toFixed(2)}`);
    }
  }
});

test('prefers-reduced-motion desliga animação e transição não essenciais', () => {
  const system = fs.readFileSync(new URL('../ui/system.css', import.meta.url), 'utf8');
  assert.match(system, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(system, /animation-duration:\s*0\.01ms/);
  assert.match(system, /transition-duration:\s*0\.01ms/);
});
