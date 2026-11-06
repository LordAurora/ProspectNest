import 'server-only';
import { getServerEnv } from '@prospectnest/core';

export const env = () => getServerEnv();

export const isSecureOrigin = () => env().APP_URL.startsWith('https://');
