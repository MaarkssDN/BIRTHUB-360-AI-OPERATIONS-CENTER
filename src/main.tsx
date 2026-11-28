import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Elemento #root ausente.');
}

createRoot(root).render(<App />);
