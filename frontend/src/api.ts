import { API_BASE } from './config';

type UnauthorizedCallback = () => void;
let unauthorizedHandler: UnauthorizedCallback | null = null;

export function setOnUnauthorized(handler: UnauthorizedCallback | null) {
  unauthorizedHandler = handler;
}

// Global monkey-patch of window.fetch to guarantee credentials: 'include' and 401 handling
const originalFetch = window.fetch.bind(window);

window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const mergedInit: RequestInit = {
    ...init,
    credentials: init?.credentials || 'include',
  };

  const response = await originalFetch(input, mergedInit);

  // Extract URL string
  let urlStr = '';
  if (typeof input === 'string') {
    urlStr = input;
  } else if (input instanceof URL) {
    urlStr = input.toString();
  } else if (input && typeof (input as Request).url === 'string') {
    urlStr = (input as Request).url;
  }

  // 401 handling: ignore /auth/login and initial /auth/me checks
  const isAuthLogin = urlStr.includes('/auth/login');
  const isAuthMe = urlStr.includes('/auth/me');

  if (response.status === 401 && !isAuthLogin && !isAuthMe) {
    if (unauthorizedHandler) {
      unauthorizedHandler();
    }
  }

  return response;
};

export async function apiFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  return fetch(url, {
    ...options,
    credentials: 'include',
  });
}
