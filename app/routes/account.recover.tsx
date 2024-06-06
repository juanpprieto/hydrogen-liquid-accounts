import {type ActionFunctionArgs} from '@shopify/remix-oxygen';

/**
 * Proxy the liquid recover form POST request in Hydrogen
 */
export async function action({request, context}: ActionFunctionArgs) {
  const {env, session} = context;
  const isPost = request.method === 'POST';

  if (!isPost) {
    return new Response('Method Not Allowed', {status: 405});
  }

  const {origin, pathname, search} = new URL(request.url);
  const liquidRecoverUrl = `${env.PUBLIC_LIQUID_STORE_URL}${pathname}${search}`;
  const clonedRequest = request.clone();

  try {
    // Authenticate the user in liquid
    const response = await fetch(liquidRecoverUrl, {
      method: 'POST',
      headers: request.headers,
      redirect: 'manual',
      body: await clonedRequest.arrayBuffer(),
    });

    // Change the location header to redirect to the login page
    const liquidLocation = response.headers.get('Location');
    const hydrogenHeaders = new Headers(response.headers);
    const hydrogenLocation = liquidLocation
      ? liquidLocation.replace(env.PUBLIC_LIQUID_STORE_URL, origin)
      : '/account';

    // Set the Location header to redirect to the proxied account page
    hydrogenHeaders.set('Location', hydrogenLocation);
    hydrogenHeaders.append('Set-Cookie', await session.commit());

    return new Response(null, {
      status: response.status,
      headers: hydrogenHeaders,
    });
  } catch (error) {
    return new Response(`Error proxying recover post request ${error}`, {
      status: 500,
    });
  }
}
