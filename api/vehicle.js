const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://sneoladihabbvhfyuqzg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_TVdtT_bghLpPq1q_8gu3iw_4MFrSHY1';
const SITE_URL = 'https://ccarautomoveis.com.br';
const template = fs.readFileSync(path.join(process.cwd(), 'dist', 'veiculo.html'), 'utf8');

function html(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function money(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL', maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function photoUrl(photoPath) {
  return `${SUPABASE_URL}/storage/v1/object/public/vehicle-photos/${String(photoPath).split('/').map(encodeURIComponent).join('/')}`;
}

function replaceMeta(source, attribute, key, value) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(`(<meta\\s+${attribute}="${escapedKey}"\\s+content=")[^"]*("\\s*>)`, 'i');
  return source.replace(expression, `$1${html(value)}$2`);
}

function notFoundPage() {
  let page = template.replace(/<title>[^<]*<\/title>/i, '<title>Veículo não encontrado | C CAR Automóveis</title>');
  page = replaceMeta(page, 'name', 'description', 'Este anúncio não está mais disponível. Consulte o estoque atualizado da C CAR Automóveis.');
  page = replaceMeta(page, 'name', 'robots', 'noindex,follow');
  return page;
}

module.exports = async function handler(request, response) {
  const id = Array.isArray(request.query.id) ? request.query.id[0] : request.query.id;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    response.status(404).setHeader('Content-Type', 'text/html; charset=utf-8').send(notFoundPage());
    return;
  }

  try {
    const endpoint = `${SUPABASE_URL}/rest/v1/vehicles?id=eq.${encodeURIComponent(id)}&status=eq.published&select=*`;
    const databaseResponse = await fetch(endpoint, { headers: { apikey: SUPABASE_KEY } });
    if (!databaseResponse.ok) throw new Error(`Supabase ${databaseResponse.status}`);
    const rows = await databaseResponse.json();
    if (!rows.length) {
      response.status(404).setHeader('Content-Type', 'text/html; charset=utf-8').send(notFoundPage());
      return;
    }

    const vehicle = rows[0];
    const name = `${vehicle.make} ${vehicle.model}${vehicle.version ? ` ${vehicle.version}` : ''}`;
    const title = `${name} ${vehicle.year} | C CAR Automóveis`;
    const description = `${name}, ano ${vehicle.year}, ${Number(vehicle.km).toLocaleString('pt-BR')} km, por ${money(vehicle.price)}. Veja fotos e fale com a C CAR Automóveis.`;
    const canonical = `${SITE_URL}/veiculo/${encodeURIComponent(vehicle.id)}`;
    const images = (vehicle.photos || []).map(photoUrl);
    const image = images[0] || `${SITE_URL}/assets/logo.png`;
    const structuredData = {
      '@context': 'https://schema.org', '@type': 'Vehicle', name, description, image: images,
      sku: vehicle.id, brand: { '@type': 'Brand', name: vehicle.make }, model: vehicle.model,
      vehicleModelDate: String(vehicle.year),
      mileageFromOdometer: { '@type': 'QuantitativeValue', value: Number(vehicle.km) || 0, unitCode: 'KMT' },
      fuelType: vehicle.fuel, vehicleTransmission: vehicle.transmission,
      offers: { '@type': 'Offer', url: canonical, priceCurrency: 'BRL', price: Number(vehicle.price) || 0,
        itemCondition: 'https://schema.org/UsedCondition', availability: 'https://schema.org/InStock' }
    };

    let page = template.replace(/<title>[^<]*<\/title>/i, `<title>${html(title)}</title>`);
    page = replaceMeta(page, 'name', 'description', description);
    page = replaceMeta(page, 'property', 'og:title', title);
    page = replaceMeta(page, 'property', 'og:description', description);
    page = replaceMeta(page, 'property', 'og:image', image);
    page = replaceMeta(page, 'name', 'twitter:title', title);
    page = replaceMeta(page, 'name', 'twitter:description', description);
    page = replaceMeta(page, 'name', 'twitter:image', image);
    const json = JSON.stringify(structuredData).replace(/</g, '\\u003c');
    page = page.replace('</head>', `  <link rel="canonical" href="${html(canonical)}">\n  <meta property="og:url" content="${html(canonical)}">\n  <meta property="product:price:amount" content="${html(Number(vehicle.price) || 0)}">\n  <meta property="product:price:currency" content="BRL">\n  <script type="application/ld+json" id="vehicleStructuredData">${json}</script>\n</head>`);

    response.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
    response.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').send(page);
  } catch (error) {
    response.setHeader('Cache-Control', 'no-store');
    response.status(503).setHeader('Content-Type', 'text/html; charset=utf-8').send(template);
  }
};
