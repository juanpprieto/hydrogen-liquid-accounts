import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from '@shopify/remix-oxygen';
import {renderLiquidRoute} from '~/lib/renderLiquidRoute.server';
import {loginUser} from '~/routes/account.login';

/**
 * Intercept the liquid `register` form POST request in Hydrogen so we can authenticate
 * the user in Hydrogen if the registration is successful.
 */
export async function action({request, context}: ActionFunctionArgs) {
  const {env, session} = context;
  const isPost = request.method === 'POST';

  if (!isPost) {
    return new Response('Method Not Allowed', {status: 405});
  }

  const {origin, pathname, search} = new URL(request.url);
  const liquidRegisterUrl = `${env.PUBLIC_LIQUID_STORE_URL}${pathname}${search}`;

  const clonedRequest = request.clone();

  // Capture email and password from the register form data
  const form = await request.formData();
  const email = String(
    form.has('customer[email]') ? form.get('customer[email]') : '',
  );
  const password = String(
    form.has('customer[password]') ? form.get('customer[password]') : '',
  );

  if (!email || !password) {
    return new Response('Missing email or password', {status: 400});
  }

  try {
    // Register the user in liquid
    const response = await fetch(liquidRegisterUrl, {
      method: 'POST',
      headers: request.headers,
      redirect: 'manual',
      body: await clonedRequest.arrayBuffer(),
    });

    // Validate that registration was successful by checking for the response status
    // which should be 302 AND have a Location header set to /. If the Location
    // header is set to /account/register, then the registration failed and we should
    // not authenticate the user in Hydrogen.
    const liquidLocation = response.headers.get('Location');
    const responseStatus = response.status;
    if (
      responseStatus === 302 &&
      liquidLocation &&
      !liquidLocation.endsWith('register')
    ) {
      // Authenticate the user in Hydrogen
      const login = await loginUser({context, email, password});

      if (login.error) {
        session.unset('customerAccessToken');
        return new Response(login.error, {status: login.status});
      }

      // Update the session with the customerAccessToken
      session.set('customerAccessToken', login.data.customerAccessToken);
    }

    // Change the Location header to redirect to hydrogen and not liquid domain
    const hydrogenHeaders = new Headers(response.headers);
    const hydrogenLocation = liquidLocation
      ? liquidLocation.replace(env.PUBLIC_LIQUID_STORE_URL, origin)
      : '/account';

    // Set the modified hydrogen Location header
    hydrogenHeaders.set('Location', hydrogenLocation);
    hydrogenHeaders.append('Set-Cookie', await session.commit());

    return new Response(null, {
      status: response.status,
      headers: hydrogenHeaders,
    });
  } catch (error) {
    return new Response(`Error proxying register post request ${error}`, {
      status: 500,
    });
  }
}

// Render the liquid /account route
export async function loader({request, context}: LoaderFunctionArgs) {
  return renderLiquidRoute({request, context});
}
