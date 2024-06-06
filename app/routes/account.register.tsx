import {type LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {renderLiquidRoute} from '~/lib/renderLiquidRoute.server';

// Render the liquid register form/route
export async function loader({request, context}: LoaderFunctionArgs) {
  return renderLiquidRoute({request, context});
}

// NOTE: The liquid register form makes a POST request to the /account route so we proxy it there
