import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from '@shopify/remix-oxygen';
import {renderLiquidRoute} from '~/lib/renderLiquidRoute.server';

/**
 * Intercept liquid addresses form POST request(s) for Adding new addresses.
 * Update and Delete requests are handled at `/account/addresses/:id`).
 */
export async function action({request, context}: ActionFunctionArgs) {
  const {env} = context;
  const isPost = request.method === 'POST';

  if (!isPost) {
    return new Response('Method Not Allowed', {status: 405});
  }

  const {origin, pathname, search} = new URL(request.url);
  const liquidAddressesUrl = `${env.PUBLIC_LIQUID_STORE_URL}${pathname}${search}`;
  const clonedRequest = request.clone();

  try {
    // Perform the liquid addresses ADD form POST
    const response = await fetch(liquidAddressesUrl, {
      method: 'POST',
      headers: request.headers,
      redirect: 'manual',
      body: await clonedRequest.arrayBuffer(),
    });

    // Change the location header to redirect to the hydrogen instead
    const liquidLocation = response.headers.get('Location');

    const hydrogenHeaders = new Headers(response.headers);
    const hydrogenLocation = liquidLocation
      ? liquidLocation.replace(env.PUBLIC_LIQUID_STORE_URL, origin)
      : '/account';

    // Set the Location header to redirect to the proxied account page
    hydrogenHeaders.set('Location', hydrogenLocation);

    return new Response(null, {
      status: response.status,
      headers: hydrogenHeaders,
    });
  } catch (error) {
    return new Response(`Error proxying addresses post request ${error}`, {
      status: 500,
    });
  }
}

// Render the /account/addresses route
export async function loader({request, context}: LoaderFunctionArgs) {
  return renderLiquidRoute({request, context});
}
