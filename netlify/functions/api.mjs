import {createNetlifyHandler} from '../../lib/netlify-handler.mjs';

export default createNetlifyHandler();
export const config = {path: ['/api/*', '/health']};
