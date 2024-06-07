# Hydrogen: Liquid Accounts

This example demonstrates a solid path for incrementally adopting Hydrogen account 
flows in Hydrogen by proxying liquid account flows, routes and mutations via Hydrogen.

[Check out Hydrogen docs](https://shopify.dev/custom-storefronts/hydrogen)
[Get familiar with Remix](https://remix.run/docs/en/v1)

## Requirements

- A liquid storefront with a standard Shopify /account flow. eg /account/login...

## Implementation

### 1. Add the `PUBLIC_LIQUID_STORE_URL` env variable 

Modify your production (Hydrogen storefront) and local environment variables to include:

```diff
# ...other env variables
+PUBLIC_LIQUID_STORE_URL=https://yourstore.myshopify.com
```

### 2. Add `PUBLIC_LIQUID_STORE_URL` to your typescript env variables

If using typescript, you will need to also add the environment variable to your `env.d.ts`


```diff

// ... other code
declare global {
  const process: {env: {NODE_ENV: 'production' | 'development'}};

  interface Env {
    SESSION_SECRET: string;
    PUBLIC_STOREFRONT_API_TOKEN: string;
    PRIVATE_STOREFRONT_API_TOKEN: string;
    PUBLIC_STORE_DOMAIN: string;
    PUBLIC_STOREFRONT_ID: string;
    PUBLIC_CUSTOMER_ACCOUNT_API_CLIENT_ID: string;
    PUBLIC_CUSTOMER_ACCOUNT_API_URL: string;
    PUBLIC_CHECKOUT_DOMAIN: string;
+   PUBLIC_LIQUID_STORE_URL: string;
  }
}
```

## 3. Add the `renderLiquidRoute` utility

Copy the `renderLiquidRoute` liquid proxying utility inside the `/lib/` folder under
`renderLiquidRoute.server.ts`

This utility proxies a given request to liquid

```ts
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
```

### 4. Copy all the following proxy-aware Hydrogen account routes

- [$.tsx]((https://github.com/juanpprieto/hydrogen-liquid-accounts/blob/main/app/routes/$.tsx): Proxy all requests that were not matched in Remix to liquid
- [account._index.tsx](https://github.com/juanpprieto/hydrogen-liquid-accounts/blob/main/app/routes/account._index.tsx): Proxies the `/account` route 
and requests to register new accounts
- [account.activate.$id.$token.tsx](https://github.com/juanpprieto/hydrogen-liquid-accounts/blob/main/app/routes/account.activate.%24id.%24token.tsx): Proxies
the account activate form route
- [account.activate.tsx](https://github.com/juanpprieto/hydrogen-liquid-accounts/blob/main/app/routes/account.activate.tsx): Proxies the account activate form
submissions and authenticates the user in Hydrogen
- [account.addresses.$id.tsx](https://github.com/juanpprieto/hydrogen-liquid-accounts/blob/main/app/routes/account.addresses.%24id.tsx): Proxies liquid address
Delete and Update form POST requests
- [account.addresses.tsx](https://github.com/juanpprieto/hydrogen-liquid-accounts/blob/main/app/routes/account.addresses.tsx): Proxies the `/account/addresses`
route as well as POST requests to `Add` new account addresses
- [account.login.tsx](https://github.com/juanpprieto/hydrogen-liquid-accounts/blob/main/app/routes/account.login.tsx): Proxies the `/account/login` form as
well as login POST requests
- [account.logout.tsx](https://github.com/juanpprieto/hydrogen-liquid-accounts/blob/main/app/routes/account.logout.tsx): Proxies `/account/logout` requests
- [account.orders.$id.tsx](https://github.com/juanpprieto/hydrogen-liquid-accounts/blob/main/app/routes/account.orders.%24id.tsx): Proxies the `/account/orders/:id` 
route
- [account.recover.tsx](https://github.com/juanpprieto/hydrogen-liquid-accounts/blob/main/app/routes/account.recover.tsx): Proxies the POST requests for
resetting account passwords
- [account.register.tsx](https://github.com/juanpprieto/hydrogen-liquid-accounts/blob/main/app/routes/account.register.tsx): Proxies the `/account/register`
route (POST requests are handled by the `/account` route)

### 5. Adjust Login / Account link component

Update the component that links to login or account at `/app/components/Header.tsx` as such:
```diff
// ... other code
+ function LiquidAccountToggle({isLoggedIn}: {isLoggedIn: boolean}) {
+   return isLoggedIn ? (
+       <a href="/account">Account</a>
+     ) : (
+       <a href="/account/login">Sign in</a>
+     );
+ }

function HeaderCtas({
  isLoggedIn,
  cart,
}: Pick<HeaderProps, 'isLoggedIn' | 'cart'>) {
  return (
    <nav className="header-ctas" role="navigation">
      <HeaderMenuMobileToggle />
-     <NavLink prefetch="intent" to="/account" style={activeLinkStyle}>
-       <Suspense fallback="Sign in">
-         <Await resolve={isLoggedIn} errorElement="Sign in">
-           {(isLoggedIn) => (isLoggedIn ? 'Account' : 'Sign in')}
-         </Await>
-       </Suspense>
-     </NavLink> 
+     <Suspense fallback={<a href="/account/login">Sign In</a>}>
+       <Await resolve={isLoggedIn} errorElement="Sign in">
+         {(isLoggedIn) => <LiquidAccountToggle isLoggedIn={isLoggedIn} />}
+       </Await>
+     </Suspense>
      <SearchToggle />
      <CartToggle cart={cart} />
    </nav>
  );
}
```
