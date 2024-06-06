import {type ActionFunctionArgs} from '@shopify/remix-oxygen';
import {loginUser} from '~/routes/account.login';

/**
 * Intercept the liquid activate form POST request and authenticate the user in Hydrogen.
 */
export async function action({request, context}: ActionFunctionArgs) {
  const {env, session} = context;
  const isPost = request.method === 'POST';

  if (!isPost) {
    return new Response('Method Not Allowed', {status: 405});
  }

  const {origin, pathname, search} = new URL(request.url);
  const liquidActivateUrl = `${env.PUBLIC_LIQUID_STORE_URL}${pathname}${search}`;
  const clonedRequest = request.clone();

  // Capture email and password from the form data
  const form = await request.formData();
  const password = String(
    form.has('customer[password]') ? form.get('customer[password]') : '',
  );

  if (!password) {
    return new Response('Missing email or password', {status: 400});
  }

  try {
    // Activate the user in liquid
    const accountResponse = await fetch(liquidActivateUrl, {
      method: 'POST',
      headers: request.headers,
      redirect: 'manual',
      body: await clonedRequest.arrayBuffer(),
    });

    // If activation is successful we get a redirect to the account page
    if (accountResponse.status === 302) {
      // fetch the account page via the redirect location
      const accountUrl = accountResponse.headers.get('Location') || '';
      const accountHeaders = new Headers(request.headers);

      // Set the cookie header from the account response
      accountHeaders.set(
        'Cookie',
        accountResponse.headers.get('Set-Cookie') || '',
      );

      // Set the accept encoding to gzip so that we can decompress the response's html body
      accountHeaders.set('Accept-Encoding', 'gzip');

      const response = await fetch(accountUrl, {
        headers: accountHeaders,
      });

      const html = await response.text();

      // NOTE:
      // In order to authenticate the user in Hydrogen, we need the email address for this
      // user ID, activation token and password.
      // To get the email we need to parse the account page HTML and extract the email address
      // from the page. This is not ideal, but it's the only way I can think of.
      // Find an email address in the account page HTML. The email is contained within a javascript
      // script tag inside and object initData as key value pair e.g "email": "jpprietobaez+pedro@gmail.com",
      const email = html.match(/"email":\s*"(.*?)"/)?.[1] || '';

      if (!email) {
        console.error('Could not find email in account page HTML');
        return new Response('Could not find email', {status: 400});
      }

      // Authenticate the user in Hydrogen
      const login = await loginUser({context, email, password});

      if (login.error) {
        session.unset('customerAccessToken');
        return new Response('Could not authenticate user', {status: 400});
      }

      // Update the session with the customerAccessToken
      session.set('customerAccessToken', login.data.customerAccessToken);
    }

    const liquidLocation = accountResponse.headers.get('Location');
    // Change the location header to redirect to the account page
    const hydrogenHeaders = new Headers(accountResponse.headers);
    const hydrogenLocation = liquidLocation
      ? liquidLocation.replace(env.PUBLIC_LIQUID_STORE_URL, origin)
      : '/account';

    // Set the Location header to redirect to the proxied account page
    hydrogenHeaders.set('Location', hydrogenLocation);

    // Save the hydrogen session cookie
    hydrogenHeaders.append('Set-Cookie', await session.commit());

    // redirect to the account page
    return new Response(null, {
      status: accountResponse.status,
      headers: hydrogenHeaders,
    });
  } catch (error) {
    console.error('Error proxying activate post request', error);
    return new Response(`Error proxying activate post request ${error}`, {
      status: 500,
    });
  }
}
