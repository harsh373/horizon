import axios from "axios";

export const UNAUTHORIZED_EVENT = "journal:unauthorized";

// In production the browser talks only to the frontend's own domain. vercel.json forwards
// /api to the backend. VITE_API_URL is used only during local development.
const backendOrigin = import.meta.env.DEV ? (import.meta.env.VITE_API_URL ?? "") : "";

type TokenGetter = () => Promise<string | null>;
let getToken: TokenGetter = async () => null;

// AuthProvider calls this once so every request can attach a fresh Clerk token.
export function setTokenGetter(getter: TokenGetter): void {
  getToken = getter;
}

export const api = axios.create({
  baseURL: `${backendOrigin}/api`,
});

api.interceptors.request.use(async (config) => {
  const token = await getToken();
  if (token) config.headers.set("Authorization", `Bearer ${token}`);
  return config;
});