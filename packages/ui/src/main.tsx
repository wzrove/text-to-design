import { render } from 'solid-js/web';
import App from './App';
import './index.css';
import { initTheme } from './theme';

// 主题:daisyUI 双主题(textdesign / textdesign_dark),用户在页头手动切换,
// 没选过时跟随系统;启动即设避免闪白(见 theme.ts)
initTheme();

const root = document.getElementById('root');
if (!root) throw new Error('root element not found');

render(() => <App />, root);
