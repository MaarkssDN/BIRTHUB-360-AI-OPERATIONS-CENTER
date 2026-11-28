import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';

const CHOICES: ThemeChoice[] = ['system', 'light', 'dark'];

const LABELS: Record<ThemeChoice, string> = {
  system: 'Sistema',
  light: 'Claro',
  dark: 'Escuro',
};

interface ThemeContextValue {
  choice: ThemeChoice;
  setChoice: (choice: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  choice: 'system',
  setChoice: () => {},
});

export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): 'light' | 'dark' {
  if (choice === 'system') {
    return prefersDark ? 'dark' : 'light';
  }
  return choice;
}

function readChoice(): ThemeChoice {
  if (typeof document === 'undefined') {
    return 'system';
  }
  const value = document.documentElement.getAttribute('data-theme-choice');
  if (value === 'light' || value === 'dark' || value === 'system') {
    return value;
  }
  return 'system';
}

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyChoice(choice: ThemeChoice): void {
  const theme = resolveTheme(choice, prefersDark());
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-theme-choice', choice);
  try {
    localStorage.setItem('b360-theme', choice);
  } catch {
    // O modo privado pode bloquear a preferência. O tema vale nesta página.
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(readChoice);

  useEffect(() => {
    if (choice !== 'system') {
      return;
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.setAttribute('data-theme', media.matches ? 'dark' : 'light');
    };
    apply();
    media.addEventListener('change', apply);
    return () => {
      media.removeEventListener('change', apply);
    };
  }, [choice]);

  const setChoice = (next: ThemeChoice) => {
    applyChoice(next);
    setChoiceState(next);
  };

  return <ThemeContext.Provider value={{ choice, setChoice }}>{children}</ThemeContext.Provider>;
}

export function ThemeControl() {
  const { choice, setChoice } = useContext(ThemeContext);
  return (
    <fieldset className="b360-theme">
      <legend>Tema</legend>
      {CHOICES.map((option) => (
        <label key={option}>
          <input
            type="radio"
            name="b360-theme"
            value={option}
            checked={choice === option}
            onChange={() => {
              setChoice(option);
            }}
          />
          {LABELS[option]}
        </label>
      ))}
    </fieldset>
  );
}
