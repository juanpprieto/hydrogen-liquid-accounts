import {type LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {renderLiquidRoute} from '~/lib/renderLiquidRoute.server';

// Renders the activate form
export async function loader({request, context}: LoaderFunctionArgs) {
  return renderLiquidRoute({request, context});
}
