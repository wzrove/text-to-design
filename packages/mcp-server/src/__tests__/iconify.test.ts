import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearIconifyCache,
  fetchIconifySvg,
  IconifyError,
  parseIconifyId,
  searchIconify,
} from '../iconify';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

afterEach(() => {
  vi.unstubAllGlobals();
  clearIconifyCache();
});

describe('Iconify 远程图标', () => {
  it('解析 prefix:name 与 prefix/name,拒绝无前缀或越界名', () => {
    expect(parseIconifyId('tabler:home')).toEqual({
      prefix: 'tabler',
      name: 'home',
    });
    expect(parseIconifyId('mdi/trash-can')).toEqual({
      prefix: 'mdi',
      name: 'trash-can',
    });
    expect(parseIconifyId('home')).toBeNull();
    expect(parseIconifyId('tabler:../etc')).toBeNull();
  });

  it('搜索只保留请求前缀内的结果,并带出许可与风格', async () => {
    const fetchMock = vi.fn(async (_url: string) =>
      json({
        icons: ['tabler:home', 'tabler:home-2', 'evil:home'],
        total: 9,
        collections: {
          tabler: {
            name: 'Tabler Icons',
            height: 24,
            palette: false,
            tags: ['Uses Stroke'],
            license: { spdx: 'MIT' },
          },
          evil: { name: 'Evil', license: { spdx: 'GPL-3.0' } },
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await searchIconify('home', { limit: 1 });
    expect(result.icons).toEqual([
      {
        id: 'tabler:home',
        collection: 'Tabler Icons',
        license: 'MIT',
        palette: false,
        height: 24,
        style: 'line',
        tags: 'Uses Stroke',
      },
    ]);
    expect(result.total).toBe(9);
    expect(result.truncated).toBe(true);
    expect(result.licenseNotice).toBeUndefined();
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('query=home');
    expect(url).toContain('limit=1');
    expect(url).toContain('prefixes=lucide');
  });

  it('显式 prefixes 覆盖默认集合;需要署名的结果给出提示', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({
          icons: ['solar:home'],
          total: 1,
          collections: {
            solar: {
              name: 'Solar',
              palette: false,
              license: { spdx: 'CC-BY-4.0' },
            },
          },
        }),
      ),
    );

    const result = await searchIconify('home', { prefixes: ['solar'] });
    expect(result.icons[0]?.id).toBe('solar:home');
    expect(result.licenseNotice).toContain('需要署名');
    expect(result.licenseNotice).toContain('CC-BY-4.0');
  });

  it('按 id 取 SVG,把尺寸和颜色写进查询', async () => {
    const fetchMock = vi.fn(
      async (_url: string) =>
        new Response('<svg xmlns="http://www.w3.org/2000/svg"></svg>', {
          status: 200,
          headers: { 'content-type': 'image/svg+xml' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const svg = await fetchIconifySvg('tabler:home', {
      size: 32,
      color: '#111111',
    });
    expect(svg).toContain('<svg');
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain('/tabler/home.svg');
    expect(url).toContain('width=32');
    expect(url).toContain('height=32');
    expect(url).toContain('color=%23111111');
  });

  it('style 按项目线形筛选,线形/填充分开返回', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string) =>
        json({
          icons: ['tabler:home', 'tabler:home-filled'],
          total: 2,
          collections: {
            tabler: {
              name: 'Tabler Icons',
              palette: false,
              tags: ['Uses Stroke'],
              license: { spdx: 'MIT' },
            },
          },
        }),
      ),
    );
    const solid = await searchIconify('home', { style: 'solid' });
    expect(solid.icons.map((i) => i.id)).toEqual(['tabler:home-filled']);
    const line = await searchIconify('home', { style: 'line' });
    expect(line.icons.map((i) => i.id)).toEqual(['tabler:home']);
  });

  it('strokeWidth 覆盖 Iconify 线宽;填充图标无 stroke 时不硬加', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (_url: string) =>
          new Response(
            '<svg xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="#111" stroke-width="1.25"><path d="M0 0"/></g></svg>',
            { status: 200 },
          ),
      ),
    );
    const svg = await fetchIconifySvg('tabler:home', { strokeWidth: 2 });
    expect(svg).toContain('stroke-width="2"');
    expect(svg).not.toContain('stroke-width="1.25"');

    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (_url: string) =>
          new Response(
            '<svg xmlns="http://www.w3.org/2000/svg"><path fill="#111" d="M0 0"/></svg>',
            {
              status: 200,
            },
          ),
      ),
    );
    const filled = await fetchIconifySvg('mdi:home', { strokeWidth: 2 });
    expect(filled).not.toContain('stroke-width');
  });

  it('404 归为 not_found,便于 create_icon 报无效 id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Not found', { status: 404 })),
    );
    await expect(fetchIconifySvg('tabler:nope')).rejects.toMatchObject({
      kind: 'not_found',
    });
    await expect(fetchIconifySvg('tabler:nope')).rejects.toBeInstanceOf(
      IconifyError,
    );
  });

  it('主域名失败时自动切换官方备用域名,并缓存同参数 SVG', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(
        new Response('<svg xmlns="http://www.w3.org/2000/svg"></svg>', {
          status: 200,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const first = await fetchIconifySvg('tabler:star', { size: 24 });
    const second = await fetchIconifySvg('tabler:star', { size: 24 });
    expect(first).toBe(second);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      'api.iconify.design',
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('api.simplesvg.com');
  });

  it('全部域名失败时在报错中透出 cause 细节', async () => {
    const cause = Object.assign(new Error('read ECONNRESET'), {
      code: 'ECONNRESET',
    });
    const err = new TypeError('fetch failed', { cause });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(err));

    await expect(fetchIconifySvg('tabler:star')).rejects.toThrow(
      /fetch failed \(ECONNRESET: read ECONNRESET\)/,
    );
  });
});
