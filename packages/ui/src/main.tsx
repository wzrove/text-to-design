import { render } from '@solidjs/web';
import App from './App';
// 副作用导入保持原位,组件样式注入顺序依赖它
// oxfmt-ignore
import './index.css';
import { initTheme } from './theme';

// 主题:daisyUI 双主题(textdesign / textdesign_dark),用户在页头手动切换,
// 没选过时跟随系统;启动即设避免闪白(见 theme.ts)
initTheme();

const root = document.getElementById('root');
if (!root) throw new Error('root element not found');

render(() => <App />, root);
