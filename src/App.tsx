import { useEffect, useState } from 'react';
import { Shell } from './ui/Shell.tsx';

function readPath(): string {
  if (typeof window === 'undefined') {
    return '/';
  }
  const path = window.location.pathname.replace(/\/$/, '');
  return path.length > 0 ? path : '/';
}

export default function App() {
  const [path] = useState(readPath);

  useEffect(() => {
    document.title =
      path === '/guia' ? 'Guia de componentes · B360-AOC' : 'Central de operações · B360-AOC';
  }, [path]);

  return <Shell path={path} />;
}
