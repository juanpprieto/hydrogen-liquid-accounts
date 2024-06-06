import {type LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {renderLiquidRoute} from '~/lib/renderLiquidRoute.server';

// Render the order detail route
export async function loader({request, context}: LoaderFunctionArgs) {
  return renderLiquidRoute({request, context});
}
