type RuntimeConfig = { apiBase: string; basePath: string };

declare global {
  interface Window {
    __AIRNEST__?: RuntimeConfig;
  }
}

export const runtimeConfig: RuntimeConfig = window.__AIRNEST__ ?? {
  apiBase: import.meta.env.VITE_AIRNEST_API ?? '/airnest',
  basePath: import.meta.env.BASE_URL,
};
