import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from '@shopify/remix-oxygen';
import {renderLiquidRoute} from '~/lib/renderLiquidRoute.server';

/**
 * Intercept the liquid login form POST request and authenticate the user in Hydrogen.
 */
export async function action({request, context}: ActionFunctionArgs) {
  const {env, session} = context;
  const isPost = request.method === 'POST';

  if (!isPost) {
    return new Response('Method Not Allowed', {status: 405});
  }

  const {origin, pathname, search} = new URL(request.url);
  const liquidLoginUrl = `${env.PUBLIC_LIQUID_STORE_URL}${pathname}${search}`;
  const clonedRequest = request.clone();

  // Capture email and password from the form data
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
    // Authenticate the user in liquid
    const response = await fetch(liquidLoginUrl, {
      method: 'POST',
      headers: request.headers,
      redirect: 'manual',
      body: await clonedRequest.arrayBuffer(),
    });

    // Validate that liquid login was successful by checking for the response status
    // which should be 302 AND have a Location header set to /account. If the Location
    // header is set to /account/login, then the registration failed and we should
    // not authenticate the user in Hydrogen.
    const liquidLocation = response.headers.get('Location');
    const responseStatus = response.status;
    if (
      responseStatus === 302 &&
      liquidLocation &&
      !liquidLocation.endsWith('login')
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

    // Change the location header to redirect to the hydrogen account route instead of the liquid one
    const hydrogenHeaders = new Headers(response.headers);
    const hydrogenLocation = liquidLocation
      ? liquidLocation.replace(env.PUBLIC_LIQUID_STORE_URL, origin)
      : '/account';

    // Set the Location header to redirect to the proxied account page
    hydrogenHeaders.set('Location', hydrogenLocation);

    // Save the hydrogen session cookie
    hydrogenHeaders.append('Set-Cookie', await session.commit());

    return new Response(null, {
      status: response.status,
      headers: hydrogenHeaders,
    });
  } catch (error) {
    return new Response(`Error proxying login post request ${error}`, {
      status: 500,
    });
  }
}

// Render the liquid /account/login form
export async function loader({request, context}: LoaderFunctionArgs) {
  return renderLiquidRoute({request, context});
}

/**
 * Authenticate the user in Hydrogen via the SFAPI and return a customerAccessToken
 * that can be saved in the session
 */
export async function loginUser({
  context,
  email,
  password,
}: {
  context: LoaderFunctionArgs['context'];
  email: string;
  password: string;
}) {
  const {session, storefront} = context;

  // NOTE: https://shopify.dev/docs/api/storefront/2024-04/queries/customer
  const LOGIN_MUTATION = `#graphql
    mutation login($input: CustomerAccessTokenCreateInput!) {
      customerAccessTokenCreate(input: $input) {
        customerUserErrors {
          code
          field
          message
        }
        customerAccessToken {
          accessToken
          expiresAt
        }
      }
    }
  ` as const;

  try {
    const {customerAccessTokenCreate} = await storefront.mutate(
      LOGIN_MUTATION,
      {
        variables: {input: {email, password}},
      },
    );

    if (!customerAccessTokenCreate?.customerAccessToken?.accessToken) {
      throw new Error(customerAccessTokenCreate?.customerUserErrors[0].message);
    }

    const {customerAccessToken} = customerAccessTokenCreate;
    session.set('customerAccessToken', customerAccessToken);

    return {error: null, status: 200, data: {customerAccessToken}};
  } catch (error) {
    if (error instanceof Error) {
      return {
        error: error.message,
        status: 401,
        data: {customerAccessToken: null},
      };
    } else {
      return {
        error: JSON.stringify(error),
        status: 401,
        data: {customerAccessToken: null},
      };
    }
  }
}
