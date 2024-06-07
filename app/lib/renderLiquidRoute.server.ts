import type {LoaderFunctionArgs} from '@remix-run/server-runtime';

const config = {
  cacheControl: 'public, max-age=3600, stale-while-revalidate=86400', // Set to the amount of time you want to cache the page, in seconds
  removeNoIndex: true, // Set to false if you want to respect robots noindex tags
  updateCanonical: true, // Set to false if you want to respect canonical meta tags
  ignoreRedirects: false, // Set to false if you aren't redirecting to Hydrogen in your theme
};

export async function renderLiquidRoute({
  context,
  request,
}: Pick<LoaderFunctionArgs, 'context' | 'request'>) {
  const {env} = context;
  const {origin, pathname, search} = new URL(request.url);
  const liquidUrl = `${env.PUBLIC_LIQUID_STORE_URL}${pathname}${search}`;
  const absoluteUrl = `${pathname}${search}`;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('Accept-Encoding', `gzip`);
  requestHeaders.append(
    'X-Shopify-Client-IP',
    request.headers.get('X-Shopify-Client-IP') || '',
  );
  requestHeaders.append(
    'X-Shopify-Client-IP-Sig',
    request.headers.get('X-Shopify-Client-IP-Sig') || '',
  );
  requestHeaders.append('User-Agent', 'Hydrogen');

  try {
    // Fetch the HTML response from the Liquid store
    const response = await fetch(liquidUrl, {
      headers: requestHeaders,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${liquidUrl}: ${response.statusText}`);
    }

    const data = await response.text();

    // Regular expressions to match and replace HTML elements
    const metaRegex = `/<meta.*name="robots".*content="noindex.*".*>`;
    const linkRegex = `/<link.*rel="canonical".*href=".*".*>`;
    const monorailRegex = `/"monorailRegion":"shop_domain"/`;
    const scriptRegex = `/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/`;
    const replaceRegex = new RegExp(
      `${metaRegex}|${linkRegex}|${monorailRegex}|${scriptRegex}`,
      'gi',
    );

    // Regular expression to match and replace liquid URLs with absolute URLs
    const liquidUrlRegex = new RegExp(liquidUrl, 'g');

    // Modify the HTML response
    const html = data
      .replace(replaceRegex, (match) => {
        if (match.startsWith('<meta') && config.removeNoIndex) return '';
        if (match.startsWith('<link') && config.updateCanonical)
          return match.replace(liquidUrl, origin);
        if (match.startsWith('"monorailRegion"'))
          return '"monorailRegion":"global"';
        if (match.startsWith('<script') && config.ignoreRedirects)
          return match.replace(/window\.location\.replace\([^)]*\);?/g, '');
        return match;
      })
      .replace(liquidUrlRegex, absoluteUrl);

    const status = /<title>(.|\n)*404 Not Found(.|\n)*<\/title>/i.test(data)
      ? 404
      : response.status;

    const responseHeaders = new Headers(response.headers);

    responseHeaders.set('content-type', 'text/html');
    responseHeaders.delete('content-encoding');

    return new Response(html, {
      status,
      headers: responseHeaders,
    });
  } catch (error) {
    if (error instanceof TypeError) {
      console.error('Error proxying route', liquidUrl, error);
      return new Response(error.message, {status: 404});
    }
    return new Response(JSON.stringify(error), {status: 500});
  }
}
