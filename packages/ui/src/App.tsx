import { BridgeProvider, useBridge } from './bridge/useBridge';
import CapabilityCard from './components/CapabilityCard';
import ConnectionHint from './components/ConnectionHint';
import EnvironmentBadge from './components/EnvironmentBadge';
import Logo from './components/Logo';
import LogPanel from './components/LogPanel';
import SelectionCard from './components/SelectionCard';
import StatusBadge from './components/StatusBadge';

function Shell() {
  const { port, log, selection, platform, status, rescan } = useBridge();
  return (
    <div class="flex h-screen flex-col gap-3 bg-base-200 p-4">
      <header class="flex min-h-0 items-center gap-2">
        <Logo class="size-5 shrink-0" />
        <h1 class="min-w-0 flex-1 truncate text-lg font-bold text-base-content">
          text-to-design MCP Bridge
        </h1>
        <EnvironmentBadge platform={platform()} />
        <StatusBadge />
        <button
          type="button"
          class="btn btn-ghost  hover:bg-white btn-xs text-base-content disabled:text-gray-500 disabled:cursor-not-allowed"
          title={
            status() === 'superseded'
              ? '夺回被另一个插件面板占用的通道'
              : '立即重连后台服务,不必等自动重连的退避间隔'
          }
          disabled={status() === 'connected'}
          onClick={() => rescan()}
        >
          {status() === 'superseded' ? '夺回' : '重试'}
        </button>
        <span
          class="badge badge-sm badge-ghost shrink-0 font-mono text-base-content/60"
          title="MCP 桥接端口(可用环境变量 TEXT_TO_DESIGN_MCP_PORT 修改)"
        >
          :{port()}
        </span>
      </header>

      <ConnectionHint />

      <SelectionCard data={selection()} />

      <CapabilityCard />

      <LogPanel entries={log()} />
    </div>
  );
}

export default function App() {
  return (
    <BridgeProvider>
      <Shell />
    </BridgeProvider>
  );
}
