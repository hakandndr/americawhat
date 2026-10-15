// Read-only navigation shared by the log and exact-address activity views.
export function analyticsQuery(f, over = {}) {
  const p = new URLSearchParams();
  const values = { range:f.range, from:f.from, to:f.to, origin:f.origin, class:f.cls, device:f.device, ip:f.ip, country:f.country, place:f.place, page:f.page, referrer:f.referrer, browser:f.browser, limit:f.limit, snapshot:f.snapshot, ...over };
  for (const [key,value] of Object.entries(values)) if (value !== '' && value != null && !(key === 'range' && value === 'all') && !(key === 'limit' && Number(value) === 50)) p.set(key,String(value));
  return p.size ? `?${p}` : '';
}

export function analyticsBack(value) {
  if (typeof value !== 'string' || value.length > 4096 || !value.startsWith('/analytics') || /[\u0000-\u001f\u007f]/.test(value)) return '/analytics';
  try {
    const url = new URL(value,'https://boss.local');
    return url.origin === 'https://boss.local' && url.pathname === '/analytics' ? url.pathname + url.search : '/analytics';
  } catch { return '/analytics'; }
}

export function ipActivityHref(address, f, current = f.p || 1) {
  const params = new URLSearchParams({ address, back:`/analytics${analyticsQuery(f,{p:current})}` });
  if (f.snapshot != null) params.set('snapshot',String(f.snapshot));
  return `/analytics/ip?${params}`;
}

export function validIpAddress(value) {
  if (typeof value !== 'string' || !value || value.length > 45) return false;
  if (!value.includes(':')) {
    const parts=value.split('.');
    return parts.length===4 && parts.every(part=>/^(0|[1-9]\d{0,2})$/.test(part) && Number(part)<=255);
  }
  if (!/^[0-9a-fA-F:.]+$/.test(value)) return false;
  try { return new URL(`http://[${value}]/`).hostname.startsWith('['); } catch { return false; }
}

export function ipActivityParams(params) {
  const address=params.get('address');
  if (params.getAll('address').length!==1 || !validIpAddress(address)) return null;
  const out={address,p:1,limit:50,snapshot:null,back:analyticsBack(params.get('back'))};
  for (const key of ['p','limit','snapshot']) {
    if (!params.has(key)) continue;
    const raw=params.get(key), n=Number(raw);
    if (params.getAll(key).length!==1 || !/^\d+$/.test(raw) || !Number.isSafeInteger(n) || n<(key==='snapshot'?0:1) || (key==='limit' && ![25,50,100].includes(n))) return null;
    out[key]=n;
  }
  return out;
}
