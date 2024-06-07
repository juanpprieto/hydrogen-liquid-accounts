import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
} from '@shopify/remix-oxygen';

export async function action(args: ActionFunctionArgs) {
  return await proxyRequestToLiquid(args);
}

export async function loader(args: LoaderFunctionArgs) {
  const response = await proxyRequestToLiquid(args);

  if (!response.ok) {
    throw new Response(`${new URL(args.request.url).pathname} not found`, {
      status: 404,
    });
  }

  return response;
}

async function proxyRequestToLiquid({request, context}: LoaderFunctionArgs) {
  const {env} = context;

  const {pathname, search} = new URL(request.url);
  const liquidUrl = `${env.PUBLIC_LIQUID_STORE_URL}${pathname}${search}`;

  const clonedRequest = request.clone();

  const requestInit: RequestInit = {
    method: request.method,
    headers: request.headers,
  };

  if (request.method !== 'GET') {
    requestInit.body = await clonedRequest.arrayBuffer();
  }

  return fetch(liquidUrl, requestInit);
}

export default function CatchAllPage() {
  return null;
}
