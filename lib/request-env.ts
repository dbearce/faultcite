import { AsyncLocalStorage } from "node:async_hooks";

export type RequestRuntimeEnv = {
  FAULTCITE_RUNTIME?: string;
  FAULTCITE_APP_ORIGIN?: string;
  CLERK_SECRET_KEY?: string;
  CLERK_PUBLISHABLE_KEY?: string;
  CLERK_FRONTEND_API?: string;
  CLERK_AUTHORIZED_PARTIES?: string;
  RESEND_API_KEY?: string;
  FAULTCITE_CONTACT_EMAIL?: string;
  FAULTCITE_EMAIL_FROM?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_PRICE_ID?: string;
  STRIPE_WEBHOOK_SECRET?: string;
};

const requestEnvironment = new AsyncLocalStorage<RequestRuntimeEnv>();

export function runWithRequestEnv<T>(env: RequestRuntimeEnv, callback: () => T): T {
  return requestEnvironment.run(env, callback);
}

export function getRequestEnv(): RequestRuntimeEnv {
  return requestEnvironment.getStore() || {};
}
