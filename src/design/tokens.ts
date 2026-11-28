/**
 * Tokens do sistema e o cálculo de contraste portado do inventário antigo.
 * A paleta slate/azul daquele inventário tinha lacunas AA registradas e não
 * entrou. Aqui a fonte é OKLCH, nos dois temas, sem lacuna conhecida.
 */

export interface DesignToken {
  name: string;
  light: string;
  dark: string;
  role: string;
}

export const TEXT_CONTRAST_MIN = 4.5;
export const UI_CONTRAST_MIN = 3;

export const DESIGN_TOKENS: DesignToken[] = [
  { name: '--b360-canvas', light: 'oklch(0.955 0.018 125)', dark: 'oklch(0.21 0.024 150)', role: 'folha' },
  { name: '--b360-panel', light: 'oklch(0.985 0.01 120)', dark: 'oklch(0.26 0.026 150)', role: 'painel' },
  { name: '--b360-elevated', light: 'oklch(0.925 0.02 125)', dark: 'oklch(0.31 0.028 150)', role: 'superfície de apoio' },
  { name: '--b360-ink', light: 'oklch(0.28 0.035 150)', dark: 'oklch(0.95 0.014 125)', role: 'texto' },
  { name: '--b360-ink-secondary', light: 'oklch(0.38 0.03 150)', dark: 'oklch(0.84 0.02 130)', role: 'texto secundário' },
  { name: '--b360-ink-muted', light: 'oklch(0.4 0.028 150)', dark: 'oklch(0.78 0.02 135)', role: 'texto auxiliar e placeholder' },
  { name: '--b360-border-strong', light: 'oklch(0.48 0.03 145)', dark: 'oklch(0.68 0.03 140)', role: 'contorno de controle' },
  { name: '--b360-header', light: 'oklch(0.36 0.055 150)', dark: 'oklch(0.52 0.05 152)', role: 'barra' },
  { name: '--b360-header-ink', light: 'oklch(0.97 0.012 120)', dark: 'oklch(0.98 0.01 120)', role: 'texto da barra' },
  { name: '--b360-accent', light: 'oklch(0.4 0.085 152)', dark: 'oklch(0.8 0.11 150)', role: 'ação' },
  { name: '--b360-accent-hover', light: 'oklch(0.46 0.09 152)', dark: 'oklch(0.86 0.1 150)', role: 'ação em hover' },
  { name: '--b360-accent-ink', light: 'oklch(0.98 0.008 120)', dark: 'oklch(0.24 0.04 150)', role: 'texto sobre a ação' },
  { name: '--b360-danger', light: 'oklch(0.42 0.12 28)', dark: 'oklch(0.72 0.14 28)', role: 'ação destrutiva e erro' },
  { name: '--b360-danger-hover', light: 'oklch(0.48 0.12 28)', dark: 'oklch(0.78 0.12 28)', role: 'ação destrutiva em hover' },
  { name: '--b360-danger-ink', light: 'oklch(0.98 0.008 120)', dark: 'oklch(0.22 0.04 28)', role: 'texto sobre o perigo' },
  { name: '--b360-focus', light: 'oklch(0.42 0.11 255)', dark: 'oklch(0.86 0.07 250)', role: 'foco fora da barra' },
  { name: '--b360-demo-fg', light: 'oklch(0.34 0.07 255)', dark: 'oklch(0.88 0.04 250)', role: 'selo demo' },
  { name: '--b360-demo-bg', light: 'oklch(0.93 0.025 250)', dark: 'oklch(0.34 0.045 255)', role: 'fundo do selo demo' },
  { name: '--b360-parcial-fg', light: 'oklch(0.36 0.075 68)', dark: 'oklch(0.9 0.05 90)', role: 'selo parcial' },
  { name: '--b360-parcial-bg', light: 'oklch(0.94 0.035 90)', dark: 'oklch(0.36 0.05 75)', role: 'fundo do selo parcial' },
  { name: '--b360-validado-fg', light: 'oklch(0.34 0.065 155)', dark: 'oklch(0.9 0.05 155)', role: 'selo validado' },
  { name: '--b360-validado-bg', light: 'oklch(0.93 0.03 155)', dark: 'oklch(0.34 0.045 155)', role: 'fundo do selo validado' },
  { name: '--b360-bloqueado-fg', light: 'oklch(0.38 0.11 28)', dark: 'oklch(0.9 0.05 30)', role: 'selo bloqueado' },
  { name: '--b360-bloqueado-bg', light: 'oklch(0.94 0.025 28)', dark: 'oklch(0.36 0.06 28)', role: 'fundo do selo bloqueado' },
  {
    name: '--b360-shadow',
    light: '0 1px 2px oklch(0.28 0.04 150 / 0.16), 0 12px 28px -16px oklch(0.28 0.04 150 / 0.28)',
    dark: '0 1px 2px oklch(0.1 0.02 150 / 0.45), 0 16px 32px -18px oklch(0.08 0.02 150 / 0.55)',
    role: 'sombra com deslocamento',
  },
  { name: '--b360-font-sans', light: '"Schibsted Grotesk", "Segoe UI", sans-serif', dark: '"Schibsted Grotesk", "Segoe UI", sans-serif', role: 'texto de interface' },
  { name: '--b360-font-mono', light: '"Fragment Mono", ui-monospace, monospace', dark: '"Fragment Mono", ui-monospace, monospace', role: 'índice, token e razão' },
  { name: '--b360-text-xs', light: '0.75rem', dark: '0.75rem', role: 'índice do selo' },
  { name: '--b360-text-sm', light: '0.875rem', dark: '0.875rem', role: 'nota' },
  { name: '--b360-text-md', light: '1rem', dark: '1rem', role: 'corpo' },
  { name: '--b360-text-lg', light: '1.25rem', dark: '1.25rem', role: 'lede' },
  { name: '--b360-text-xl', light: '1.75rem', dark: '1.75rem', role: 'seção' },
  { name: '--b360-text-2xl', light: '2.25rem', dark: '2.25rem', role: 'título' },
  { name: '--b360-leading-tight', light: '1.2', dark: '1.2', role: 'entrelinha de título' },
  { name: '--b360-leading-body', light: '1.5', dark: '1.5', role: 'entrelinha de corpo' },
  { name: '--b360-weight-regular', light: '400', dark: '400', role: 'peso regular' },
  { name: '--b360-weight-medium', light: '500', dark: '500', role: 'peso médio' },
  { name: '--b360-weight-bold', light: '700', dark: '700', role: 'peso forte' },
  { name: '--b360-tracking-tight', light: '-0.03em', dark: '-0.03em', role: 'tracking de título' },
  { name: '--b360-measure', light: '68ch', dark: '68ch', role: 'medida do texto' },
  { name: '--b360-space-1', light: '0.25rem', dark: '0.25rem', role: 'espaço 4' },
  { name: '--b360-space-2', light: '0.5rem', dark: '0.5rem', role: 'espaço 8' },
  { name: '--b360-space-3', light: '0.75rem', dark: '0.75rem', role: 'espaço 12' },
  { name: '--b360-space-4', light: '1rem', dark: '1rem', role: 'espaço 16' },
  { name: '--b360-space-5', light: '1.5rem', dark: '1.5rem', role: 'espaço 24' },
  { name: '--b360-space-6', light: '2rem', dark: '2rem', role: 'espaço 32' },
  { name: '--b360-space-7', light: '3rem', dark: '3rem', role: 'espaço 48' },
  { name: '--b360-space-8', light: '4.5rem', dark: '4.5rem', role: 'espaço 72' },
  { name: '--b360-radius-sm', light: '0.25rem', dark: '0.25rem', role: 'raio do selo' },
  { name: '--b360-radius-md', light: '0.5rem', dark: '0.5rem', role: 'raio do controle' },
  { name: '--b360-radius-lg', light: '0.75rem', dark: '0.75rem', role: 'raio do cartão' },
  { name: '--b360-duration-fast', light: '140ms', dark: '140ms', role: 'duração curta' },
  { name: '--b360-duration-base', light: '200ms', dark: '200ms', role: 'duração da troca de tema' },
  { name: '--b360-duration-slow', light: '320ms', dark: '320ms', role: 'duração longa' },
  { name: '--b360-ease-out', light: 'cubic-bezier(0.16, 1, 0.3, 1)', dark: 'cubic-bezier(0.16, 1, 0.3, 1)', role: 'curva de saída' },
  { name: '--b360-ease-press', light: 'cubic-bezier(0.2, 0, 0, 1)', dark: 'cubic-bezier(0.2, 0, 0, 1)', role: 'curva de controle' },
];

export interface ContrastPair {
  fg: string;
  bg: string;
  label: string;
}

/** Texto pequeno. O anel de foco da barra usa --b360-header-ink sobre --b360-header. */
export const TEXT_PAIRS: ContrastPair[] = [
  { fg: '--b360-ink', bg: '--b360-canvas', label: 'texto sobre a folha' },
  { fg: '--b360-ink', bg: '--b360-panel', label: 'texto sobre o painel' },
  { fg: '--b360-ink', bg: '--b360-elevated', label: 'texto sobre a superfície de apoio' },
  { fg: '--b360-ink-secondary', bg: '--b360-canvas', label: 'texto secundário sobre a folha' },
  { fg: '--b360-ink-secondary', bg: '--b360-panel', label: 'texto secundário sobre o painel' },
  { fg: '--b360-ink-secondary', bg: '--b360-elevated', label: 'texto secundário sobre a superfície de apoio' },
  { fg: '--b360-ink-muted', bg: '--b360-canvas', label: 'texto auxiliar sobre a folha' },
  { fg: '--b360-ink-muted', bg: '--b360-panel', label: 'placeholder sobre o painel' },
  { fg: '--b360-ink-muted', bg: '--b360-elevated', label: 'desabilitado sobre a superfície de apoio' },
  { fg: '--b360-header-ink', bg: '--b360-header', label: 'texto da barra' },
  { fg: '--b360-accent-ink', bg: '--b360-accent', label: 'texto do botão primário' },
  { fg: '--b360-accent-ink', bg: '--b360-accent-hover', label: 'texto do botão primário em hover' },
  { fg: '--b360-danger-ink', bg: '--b360-danger', label: 'texto do botão de perigo' },
  { fg: '--b360-danger-ink', bg: '--b360-danger-hover', label: 'texto do botão de perigo em hover' },
  { fg: '--b360-danger', bg: '--b360-panel', label: 'erro sobre o painel' },
  { fg: '--b360-danger', bg: '--b360-canvas', label: 'erro sobre a folha' },
  { fg: '--b360-demo-fg', bg: '--b360-demo-bg', label: 'selo demo' },
  { fg: '--b360-parcial-fg', bg: '--b360-parcial-bg', label: 'selo parcial' },
  { fg: '--b360-validado-fg', bg: '--b360-validado-bg', label: 'selo validado' },
  { fg: '--b360-bloqueado-fg', bg: '--b360-bloqueado-bg', label: 'selo bloqueado' },
];

/** Contorno, preenchimento e foco. O foco da página fica sobre a folha, não sobre o preenchimento do botão. */
export const UI_PAIRS: ContrastPair[] = [
  { fg: '--b360-border-strong', bg: '--b360-canvas', label: 'contorno sobre a folha' },
  { fg: '--b360-border-strong', bg: '--b360-panel', label: 'contorno sobre o painel' },
  { fg: '--b360-border-strong', bg: '--b360-elevated', label: 'contorno sobre a superfície de apoio' },
  { fg: '--b360-accent', bg: '--b360-canvas', label: 'botão primário sobre a folha' },
  { fg: '--b360-accent', bg: '--b360-panel', label: 'botão primário sobre o painel' },
  { fg: '--b360-accent-hover', bg: '--b360-canvas', label: 'botão primário em hover sobre a folha' },
  { fg: '--b360-danger', bg: '--b360-canvas', label: 'botão de perigo sobre a folha' },
  { fg: '--b360-danger', bg: '--b360-panel', label: 'contorno de erro sobre o painel' },
  { fg: '--b360-danger-hover', bg: '--b360-canvas', label: 'botão de perigo em hover sobre a folha' },
  { fg: '--b360-focus', bg: '--b360-canvas', label: 'foco sobre a folha' },
  { fg: '--b360-focus', bg: '--b360-panel', label: 'foco sobre o painel' },
  { fg: '--b360-focus', bg: '--b360-elevated', label: 'foco sobre a superfície de apoio' },
  { fg: '--b360-header', bg: '--b360-canvas', label: 'barra sobre a folha' },
  { fg: '--b360-header-ink', bg: '--b360-header', label: 'foco da barra' },
  { fg: '--b360-demo-fg', bg: '--b360-canvas', label: 'contorno do selo demo sobre a folha' },
  { fg: '--b360-demo-fg', bg: '--b360-panel', label: 'contorno do selo demo sobre o painel' },
  { fg: '--b360-parcial-fg', bg: '--b360-canvas', label: 'contorno do selo parcial sobre a folha' },
  { fg: '--b360-parcial-fg', bg: '--b360-panel', label: 'contorno do selo parcial sobre o painel' },
  { fg: '--b360-validado-fg', bg: '--b360-canvas', label: 'contorno do selo validado sobre a folha' },
  { fg: '--b360-validado-fg', bg: '--b360-panel', label: 'contorno do selo validado sobre o painel' },
  { fg: '--b360-bloqueado-fg', bg: '--b360-canvas', label: 'contorno do selo bloqueado sobre a folha' },
  { fg: '--b360-bloqueado-fg', bg: '--b360-panel', label: 'contorno do selo bloqueado sobre o painel' },
];

export const SWATCHES: Array<{ name: string; label: string }> = [
  { name: '--b360-canvas', label: 'Folha' },
  { name: '--b360-panel', label: 'Painel' },
  { name: '--b360-elevated', label: 'Apoio' },
  { name: '--b360-ink', label: 'Tinta' },
  { name: '--b360-header', label: 'Barra' },
  { name: '--b360-accent', label: 'Ação' },
  { name: '--b360-danger', label: 'Perigo' },
  { name: '--b360-focus', label: 'Foco' },
  { name: '--b360-demo-bg', label: 'Demo' },
  { name: '--b360-parcial-bg', label: 'Parcial' },
  { name: '--b360-validado-bg', label: 'Validado' },
  { name: '--b360-bloqueado-bg', label: 'Bloqueado' },
];

export type ThemeName = 'light' | 'dark';

export function tokenValue(name: string, theme: ThemeName): string {
  const token = DESIGN_TOKENS.find((item) => item.name === name);
  if (!token) {
    throw new Error(`Token ausente: ${name}`);
  }
  return theme === 'light' ? token.light : token.dark;
}

interface LinearRgb {
  r: number;
  g: number;
  b: number;
  outOfGamut: boolean;
}

function clipUnit(channel: number): number {
  return Math.min(1, Math.max(0, channel));
}

function oklchToLinear(lightness: number, chroma: number, hue: number): LinearRgb {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const lmsL = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const lmsM = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const lmsS = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lmsL ** 3;
  const m = lmsM ** 3;
  const s = lmsS ** 3;
  const red = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const green = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const blue = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const outOfGamut = [red, green, blue].some((channel) => channel < -0.002 || channel > 1.002);
  return {
    r: clipUnit(red),
    g: clipUnit(green),
    b: clipUnit(blue),
    outOfGamut,
  };
}

function srgbChannelToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function hexToLinear(hex: string): LinearRgb {
  const normalized = hex.replace('#', '');
  const channels = [0, 2, 4].map((index) => {
    const value = parseInt(normalized.slice(index, index + 2), 16) / 255;
    return srgbChannelToLinear(value);
  });
  return { r: channels[0] ?? 0, g: channels[1] ?? 0, b: channels[2] ?? 0, outOfGamut: false };
}

export function parseColor(color: string): LinearRgb {
  const oklch = /^oklch\(\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s*\)$/.exec(color);
  if (oklch) {
    return oklchToLinear(Number(oklch[1]), Number(oklch[2]), Number(oklch[3]));
  }
  const hex = /^#([0-9a-fA-F]{6})$/.exec(color);
  if (hex) {
    return hexToLinear(color);
  }
  throw new Error(`Cor fora do contrato: ${color}`);
}

export function isInGamut(color: string): boolean {
  return !parseColor(color).outOfGamut;
}

export function relativeLuminance(color: string): number {
  const linear = parseColor(color);
  return 0.2126 * linear.r + 0.7152 * linear.g + 0.0722 * linear.b;
}

export function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

export function parseCustomProperties(block: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const match of block.matchAll(/(--b360-[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const name = match[1];
    const value = match[2];
    if (name !== undefined && value !== undefined) {
      found[name] = value.trim().replace(/\s+/g, ' ');
    }
  }
  return found;
}

export function isThemeColor(value: string): boolean {
  return value.startsWith('oklch(');
}
