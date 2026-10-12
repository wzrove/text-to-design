import type { Messages } from './zh-CN';

export const en = {
  meta: {
    title: 'text-to-design — let AI draw inside your design tool',
    description:
      'text-to-design wires AI assistants into jsDesign, Figma and MasterGo: describe what you want and it reads the canvas, builds nodes, restyles them and exports images. One MCP service plus a platform plugin.',
    ogTitle: 'text-to-design — let AI draw inside your design tool',
    ogDescription:
      'AI works the canvas directly: read the selection, draw from a description, restyle, export images. jsDesign / Figma / MasterGo.',
  },

  copy: {
    button: 'Copy',
    done: 'Copied',
    aria: 'Copy to clipboard',
  },

  header: {
    nav: {
      capabilities: 'Features',
      platforms: 'Platforms',
      install: 'Install',
      faq: 'Troubleshooting',
    },
    navAria: 'Page navigation',
    langAria: 'Interface language',
    repo: 'Source',
    download: 'Get plugin',
    themeTitle: 'Theme: {mode} — click to switch',
    themeAria: 'Switch theme, currently {mode}',
    theme: { system: 'System', light: 'Light', dark: 'Dark' },
  },

  contacts: {
    labels: { qq: 'QQ group' },
    copyTitle: '{label} {value} · click to copy',
    copyAria: '{label} {value}, click to copy',
  },

  hero: {
    badge: 'MCP · jsDesign / Figma / MasterGo',
    title: 'Let AI draw inside your {brand}',
    titleBrand: 'design tool',
    lead: 'text-to-design connects assistants like {assistants} to the canvas: read the current selection, draw new shapes from your description, restyle them, export images. You describe it, the AI does it.',
    ctaDownload: 'Download plugin',
    ctaDocs: 'Install guide',
    support: 'Supports',
    service: 'Background service · one command',
    copyService: 'Copy service command',
    session: 'AI session',
    demoGroup: 'Demo tasks',
    connected: 'Connected',
    canvas: 'Canvas',
    steps: ['Prompt', 'Tool call', 'Written to canvas'],
    footnote:
      'Driven by the real tool surface · the panel says “Connected” when it is live',
    replay: 'Replay demo',
    assistants: { list: ['Codex', 'Claude Code', 'opencode'], sep: ', ' },
    demo: {
      card: {
        label: 'card',
        prompt:
          'Draw a 300×200 card at the canvas center, title “Publish”, light grey background, a green button bottom right.',
        toolLine: 'jsd_create_nodes → 3 nodes written',
        titleChars: ['P', 'u', 'b', 'l', 'i', 's', 'h'],
        tagDraft: 'draft',
        tagVersion: 'v2',
        button: 'Publish',
      },
      chart: {
        label: 'chart',
        prompt:
          'Turn this monthly data into a bar chart: Jan–Jun, values 32, 58, 41, 77, 64, 90, light grey axes, brand green bars.',
        toolLine: 'jsd_html_to_design → chart generated',
        axisTitle: 'Monthly output',
        peak: 'peak 90',
        months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
      },
      menu: {
        label: 'menu',
        prompt:
          'Draw a coffee shop menu titled “Misty Peak”, four drinks with prices, and “Scan to order” in the footer.',
        toolLine: 'jsd_create_nodes → 12 nodes written',
        titleChars: ['M', 'i', 's', 't', 'y', ' ', 'P', 'e', 'a', 'k'],
        items: [
          { name: 'Americano', price: '$4' },
          { name: 'Latte', price: '$5' },
          { name: 'Misty milk', price: '$6' },
          { name: 'Cold brew', price: '$5' },
        ],
        foot: 'Scan to order',
      },
    },
  },

  platforms: {
    index: '01 / Platforms',
    title: 'Three platforms, three builds',
    lead: 'One plugin package, built per platform. Pick your design tool, then import the manifest at the path below.',
    tablistAria: 'Design platforms',
    stepsTitle: '{name} import steps',
    manifestLabel: 'manifest path',
    copyManifest: 'Copy manifest path',
    mastergoNote:
      'MasterGo takes an uploaded plugin; the file you pick is the same manifest.',
    beforeLabel: 'Before importing: get the build',
    beforeItems: [
      'Download the plugin package from GitHub Releases and unzip it',
      'The unzipped folder already carries all three platforms — locate this platform’s manifest',
    ],
    goReleases: 'Open Releases',
    items: {
      jsdesign: {
        name: 'jsDesign',
        steps: [
          'Open the jsDesign client, click “Plugins” in the left rail',
          'Choose “Import” and point it at dist/jsdesign/manifest.json',
          'Run the plugin on the canvas; the panel reads “Connected” when ready',
        ],
        extra:
          'Full core surface: node read/write, auto layout, components and instances, SVG/icon import, image export.',
      },
      figma: {
        name: 'Figma',
        steps: [
          'Menu Plugins → Development → Import plugin from manifest',
          'Pick dist/figma/manifest.json',
          'Run the plugin; the panel reads “Connected” when ready',
        ],
        extra:
          'Beyond the core: variables, local styles and component properties (through jsd_platform_op).',
      },
      mastergo: {
        name: 'MasterGo',
        steps: [
          'Open MasterGo, go to “Plugins” → “Developer mode”',
          'Click “Create / add plugin” and upload dist/mastergo/manifest.json',
          'Run the plugin; the panel reads “Connected” when ready',
        ],
        extra:
          'Beyond the core: component property management and variant switching inside a component set.',
      },
    },
  },

  install: {
    index: '02 / Install',
    title: 'Three steps',
    lead: 'Step one registers and verifies the background service, step two imports the plugin per platform, step three restarts the session to shake hands. Only one of them is manual.',
    stepLabel: 'step {n}',
    steps: [
      {
        title: 'Hand the install prompt to your AI',
        body: 'The AI registers and verifies the service itself; you never touch a config file.',
      },
      {
        title: 'Import the plugin into your design tool',
        body: 'Pick the manifest for jsDesign / Figma / MasterGo; run it until the panel says “Connected”.',
      },
      {
        title: 'Restart the AI session',
        body: 'Let it call jsd_ping — once that returns, you are drawing.',
      },
    ],
    promptLabel: 'Prompt to paste into your AI',
    copyPrompt: 'Copy the full install prompt',
    prompt: `Please install text-to-design end to end and report progress per step:

1. Register the MCP server: use your tool's native way to add a stdio MCP server with
   command npx -y text-to-design-mcp@latest (no manual install; npx fetches and runs it).

2. Verify the background service starts:
   timeout 5 npx -y text-to-design-mcp@latest
   Expect "[text-to-design-mcp] shim mode" or "daemon ready" (first run spawns the resident daemon).

3. Download and unpack the design-tool plugin into your home directory:
   cd ~ && npm pack text-to-design-ui
   mkdir -p text-to-design-plugin
   tar -xzf text-to-design-ui-*.tgz -C text-to-design-plugin --strip-components=1
   (If the npm package is not published yet, use the plugin archive from GitHub Releases.)

4. After those three steps, tell the user two manual steps remain:
   - Import the plugin in their design tool: jsDesign picks dist/jsdesign/manifest.json,
     Figma picks dist/figma/manifest.json, MasterGo uses "Plugins → Developer mode →
     Create/add plugin" with dist/mastergo/manifest.json; run it until the panel says "Connected"
   - Restart the AI session and call jsd_ping to verify the link

5. Report what is done.`,
    whereLabel: 'Where the manual step gets its files:',
  },

  footer: {
    blurb:
      'A bridge between AI assistants and design canvases. MIT licensed — service and plugin builds are all in the repo.',
    resources: 'Resources',
    links: {
      releases: 'Plugin builds / Releases',
      repo: 'Source repository',
      tools: 'Full tool list',
      readme: 'Install & troubleshooting doc',
    },
    distribution: 'Distribution',
    distributionItems: [
      'text-to-design-mcp (background service)',
      'text-to-design-ui (three platform plugins)',
      'ports 47812 / 47820',
    ],
    contact: 'Contact',
    copyContact: 'Copy {label}',
    contactNote:
      'Mention “text-to-design” when joining; keep issues in the repo tracker first.',
  },
} satisfies Messages;

export type { Messages } from './zh-CN';
