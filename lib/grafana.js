const axios = require('axios');

const {
  GRAFANA_BASE_URL,
  GRAFANA_DASHBOARD_UID,
  GRAFANA_DASHBOARD_SLUG,
  GRAFANA_ORG_ID,
  GRAFANA_TOKEN,
  GRAFANA_WIDTH,
  GRAFANA_HEIGHT,
} = process.env;

/**
 * Builds the render-image URL for a given panel + time range.
 * from/to accept Grafana's relative time syntax, e.g. "now-6h", "now".
 */
function buildRenderUrl({ panelId, from, to }) {
  const url = new URL(
    `${GRAFANA_BASE_URL}/render/d-solo/${GRAFANA_DASHBOARD_UID}/${GRAFANA_DASHBOARD_SLUG}`
  );
  url.searchParams.set('orgId', GRAFANA_ORG_ID || '1');
  url.searchParams.set('from', from);
  url.searchParams.set('to', to);
  url.searchParams.set('panelId', String(panelId));
  url.searchParams.set('width', GRAFANA_WIDTH || '1000');
  url.searchParams.set('height', GRAFANA_HEIGHT || '500');
  return url.toString();
}

/**
 * Fetches the rendered panel image as a Buffer.
 */
async function fetchPanelImage({ panelId, from, to }) {
  const renderUrl = buildRenderUrl({ panelId, from, to });

  if (!GRAFANA_TOKEN) {
    throw new Error('GRAFANA_TOKEN is empty — check your .env file.');
  }

  const response = await axios.get(renderUrl, {
    headers: {
      Authorization: `Bearer ${GRAFANA_TOKEN}`,
    },
    responseType: 'arraybuffer',
    timeout: 30000,
    validateStatus: () => true, // handle non-2xx/redirects ourselves so we can show the real message
    maxRedirects: 0, // don't silently follow a redirect to a login page
  });

  const contentType = response.headers['content-type'] || '';

  if (response.status >= 300 && response.status < 400) {
    throw new Error(
      `Grafana redirected the request (status ${response.status}) to "${response.headers.location}". ` +
      `This almost always means the Authorization token was rejected. ` +
      `Token preview being sent: "${GRAFANA_TOKEN.slice(0, 6)}...${GRAFANA_TOKEN.slice(-4)}" (length ${GRAFANA_TOKEN.length}).`
    );
  }

  if (response.status < 200 || response.status >= 300 || !contentType.startsWith('image/')) {
    const bodyText = Buffer.from(response.data).toString('utf8').slice(0, 500);
    throw new Error(
      `Grafana did not return an image (status ${response.status}, content-type "${contentType}"). ` +
      `Response body: ${bodyText}`
    );
  }

  return Buffer.from(response.data);
}

module.exports = { buildRenderUrl, fetchPanelImage };