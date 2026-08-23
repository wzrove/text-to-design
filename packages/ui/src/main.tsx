import { render } from 'solid-js/web';
import App from './App';
import './index.css';

// 主题跟随系统:daisyUI 双主题(textdesign / textdesign_dark),启动即设避免闪白
const themeQuery = window.matchMedia('(prefers-color-scheme: dark)');
const applyTheme = (): void =>
  document.documentElement.setAttribute(
    'data-theme',
    themeQuery.matches ? 'textdesign_dark' : 'textdesign',
  );
applyTheme();
themeQuery.addEventListener('change', applyTheme);

const root = document.getElementById('root');
if (!root) throw new Error('root element not found');

render(() => <App />, root);
