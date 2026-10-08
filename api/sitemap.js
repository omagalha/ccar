const SUPABASE_URL = 'https://sneoladihabbvhfyuqzg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_TVdtT_bghLpPq1q_8gu3iw_4MFrSHY1';
const SITE_URL = 'https://ccarautomoveis.com.br';

function xml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
  })[character]);
}

module.exports = async function handler(request, response) {
  let vehicles = [];
  try {
    const endpoint = `${SUPABASE_URL}/rest/v1/vehicles?status=eq.published&select=id,updated_at&order=created_at.desc`;
    const databaseResponse = await fetch(endpoint, { headers: { apikey: SUPABASE_KEY } });
    if (databaseResponse.ok) vehicles = await databaseResponse.json();
  } catch (_) {}

  const entries = [
    `<url><loc>${SITE_URL}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>`,
    `<url><loc>${SITE_URL}/privacidade.html</loc><changefreq>yearly</changefreq><priority>0.2</priority></url>`,
    ...vehicles.map(vehicle => {
      const location = `${SITE_URL}/veiculo/${encodeURIComponent(vehicle.id)}`;
      const lastModified = vehicle.updated_at ? `<lastmod>${xml(new Date(vehicle.updated_at).toISOString())}</lastmod>` : '';
      return `<url><loc>${xml(location)}</loc>${lastModified}<changefreq>weekly</changefreq><priority>0.8</priority></url>`;
    })
  ];

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>`;
  response.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  response.status(200).setHeader('Content-Type', 'application/xml; charset=utf-8').send(sitemap);
};
