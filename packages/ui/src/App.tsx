import { BridgeProvider, useBridge } from './bridge/useBridge';
import ConnectionHint from './components/ConnectionHint';
import EnvironmentBadge from './components/EnvironmentBadge';
import Logo from './components/Logo';
import LogPanel from './components/LogPanel';
import SelectionCard from './components/SelectionCard';
import StatusBadge from './components/StatusBadge';

function Shell() {
  const { port, log, selection, platform } = useBridge();
  return (
    <div class="flex h-screen flex-col gap-3 bg-base-200 p-4">
      <header class="flex min-h-0 items-center gap-2">
        <Logo class="size-5 shrink-0" />
        <h1 class="min-w-0 flex-1 truncate text-lg font-bold text-base-content">
          text-to-design MCP Bridge
        </h1>
        <EnvironmentBadge platform={platform()} />
        <StatusBadge />
        <span class="badge badge-sm badge-info shrink-0 font-mono">
          :{port()}
        </span>
      </header>

      <ConnectionHint />

      <SelectionCard data={selection()} />

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
