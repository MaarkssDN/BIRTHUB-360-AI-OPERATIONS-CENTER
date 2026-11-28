import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import '@fontsource/schibsted-grotesk/latin-400.css';
import '@fontsource/schibsted-grotesk/latin-500.css';
import '@fontsource/schibsted-grotesk/latin-700.css';
import '@fontsource/fragment-mono/latin-400.css';
import './index.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Elemento #root ausente.');
}

createRoot(root).render(<App />);
