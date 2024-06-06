import {type ActionFunctionArgs} from '@shopify/remix-oxygen';

/**
 * Intercept the liquid logout form GET request to unauthenticate the user in Hydrogen.
 */
export async function loader({request, context}: ActionFunctionArgs) {
  const {env, session} = context;

  // Unathenticate the user in hydrogen
  session.unset('customerAccessToken');

  const {origin, pathname, search} = new URL(request.url);
  const liquidLoginUrl = `${env.PUBLIC_LIQUID_STORE_URL}${pathname}${search}`;

  try {
    // Unauthenticate the user in liquid
    const response = await fetch(liquidLoginUrl, {
      method: 'GET',
      headers: request.headers,
      redirect: 'manual',
    });

    const homepageHtml = await response.arrayBuffer();

    // Change the location header to redirect to hydrogen instead of liquid
    const hydrogenHeaders = new Headers(response.headers);
    const liquidLocation = hydrogenHeaders.get('Location');

    const hydrogenLocation = liquidLocation
      ? liquidLocation.replace(env.PUBLIC_LIQUID_STORE_URL, origin)
      : `${origin}`;

    // Set the Location header to redirect to the proxied account page
    hydrogenHeaders.set('Location', hydrogenLocation);
    hydrogenHeaders.set('Set-Cookie', await session.commit());

    return new Response(homepageHtml, {
      status: response.status,
      headers: hydrogenHeaders,
    });
  } catch (error) {
    return new Response(`Error proxying logout request ${error}`, {
      status: 500,
    });
  }
}
