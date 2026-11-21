import dotenv from "dotenv";

dotenv.config();

type NodeEnv = "development" | "production" | "test";

export interface Env {
  nodeEnv: NodeEnv;
  isProduction: boolean;
  port: number;
  clientOrigin: string;
  clerkPublishableKey: string;
  clerkSecretKey: string;
  vaultSecret: string;
  mongodbUri: string;
  cloudinaryCloudName: string;
  cloudinaryApiKey: string;
  cloudinaryApiSecret: string;
  aiApiKey: string;
  aiBaseUrl: string;
  aiFastModel: string;
  aiSmartModel: string;
  aiReasoningEffort: string;
  embeddingApiKey: string;
  embeddingUrl: string;
}

function parseNodeEnv(value: string | undefined): NodeEnv {
  if (value === "production" || value === "test") return value;
  return "development";
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? 4000);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT value: ${value}`);
  }
  return port;
}

function requireValue(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(`${name} is not set. Add it to backend/.env.`);
  }
  return value.trim();
}

// A base64 secret that must decode to at least `minBytes` bytes.
function requireBase64Secret(name: string, value: string | undefined, minBytes: number): string {
  const secret = requireValue(name, value);
  if (Buffer.from(secret, "base64").length < minBytes) {
    throw new Error(`${name} must be at least ${minBytes} random bytes (base64). Generate one with: openssl rand -base64 32`);
  }
  return secret;
}

// AI settings are optional: without them the journal works exactly as before.
function optionalValue(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

const nodeEnv = parseNodeEnv(process.env.NODE_ENV);

export const env: Env = {
  nodeEnv,
  isProduction: nodeEnv === "production",
  port: parsePort(process.env.PORT),
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",
  clerkPublishableKey: requireValue("CLERK_PUBLISHABLE_KEY", process.env.CLERK_PUBLISHABLE_KEY),
  clerkSecretKey: requireValue("CLERK_SECRET_KEY", process.env.CLERK_SECRET_KEY),
  vaultSecret: requireBase64Secret("VAULT_SECRET", process.env.VAULT_SECRET, 32),
  mongodbUri: requireValue("MONGODB_URI", process.env.MONGODB_URI),
  cloudinaryCloudName: requireValue("CLOUDINARY_CLOUD_NAME", process.env.CLOUDINARY_CLOUD_NAME),
  cloudinaryApiKey: requireValue("CLOUDINARY_API_KEY", process.env.CLOUDINARY_API_KEY),
  cloudinaryApiSecret: requireValue("CLOUDINARY_API_SECRET", process.env.CLOUDINARY_API_SECRET),
  aiApiKey: optionalValue(process.env.AI_API_KEY, ""),
  aiBaseUrl: optionalValue(process.env.AI_BASE_URL, "https://api.groq.com/openai/v1"),
  aiFastModel: optionalValue(process.env.AI_FAST_MODEL, "openai/gpt-oss-20b"),
  aiSmartModel: optionalValue(process.env.AI_SMART_MODEL, "openai/gpt-oss-120b"),
  aiReasoningEffort: optionalValue(process.env.AI_REASONING_EFFORT, ""),
  embeddingApiKey: optionalValue(process.env.EMBEDDING_API_KEY, ""),
  embeddingUrl: optionalValue(
    process.env.EMBEDDING_URL,
    "https://router.huggingface.co/hf-inference/models/BAAI/bge-small-en-v1.5/pipeline/feature-extraction",
  ),
};