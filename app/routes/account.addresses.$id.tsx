import {type ActionFunctionArgs} from '@shopify/remix-oxygen';

/**
 * Intercept liquid address Delete and Update form POST requests
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
    // Update/Delete the address in liquid
    const response = await fetch(liquidAddressesUrl, {
      method: 'POST',
      headers: request.headers,
      redirect: 'manual',
      body: await clonedRequest.arrayBuffer(),
    });

    // Change the location header to redirect to the hydrogen account page
    const liquidLocation = response.headers.get('Location');

    // Strip ?sid params from the liquid location
    const cleanLiquidLocation = liquidLocation
      ? liquidLocation.split('?sid')[0]
      : '/account';

    const hydrogenHeaders = new Headers(response.headers);

    const hydrogenLocation = cleanLiquidLocation.replace(
      env.PUBLIC_LIQUID_STORE_URL,
      origin,
    );

    // Set the updated Location header
    hydrogenHeaders.set('Location', hydrogenLocation);

    // Return the modified redirect response
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
