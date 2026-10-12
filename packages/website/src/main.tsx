import { render } from 'solid-js/web';
import App from './App';
import { LocaleProvider } from './i18n/context';
import { applyStoredTheme } from './theme';
import './index.css';

applyStoredTheme();

// 先挂标记再渲染:无此标记时 data-reveal 元素不做隐藏,脚本挂掉内容照样可见
document.documentElement.classList.add('js-reveal');

render(
  () => (
    <LocaleProvider>
      <App />
    </LocaleProvider>
  ),
  document.getElementById('root') as HTMLElement,
);
