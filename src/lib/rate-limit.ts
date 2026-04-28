import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextRequest, NextResponse } from "next/server";

export type RateLimitDecision =
  | {
      allowed: true;
      limit: number;
      remaining: number;
      reset: number;
    }
  | {
      allowed: false;
      limit?: number;
      remaining?: number;
      reset?: number;
      retryAfterSeconds: number;
      unavailable?: boolean;
    };

type Scope = "login-ip" | "login-email" | "embajador";

const limiterCache = new Map<Scope, Ratelimit | null>();
let redisClient: Redis | null = null;

function getRedisClient() {
  if (redisClient) {
    return redisClient;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return null;
  }

  redisClient = new Redis({ url, token });
  return redisClient;
}

function getLimiter(scope: Scope, limit: number, duration: string) {
  const existing = limiterCache.get(scope);
  if (existing !== undefined) {
    return existing;
  }

  const redis = getRedisClient();
  if (!redis) {
    limiterCache.set(scope, null);
    return null;
  }

  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(limit, duration as any),
    prefix: `@trabix/${scope}`
  });

  limiterCache.set(scope, limiter);
  return limiter;
}

function retryAfterSeconds(reset?: number) {
  if (!reset) {
    return 1;
  }

  return Math.max(1, Math.ceil((reset - Date.now()) / 1000));
}

async function evaluateLimit(scope: Scope, limit: number, duration: string, identifier: string): Promise<RateLimitDecision> {
  const limiter = getLimiter(scope, limit, duration);
  if (!limiter) {
    return {
      allowed: false,
      retryAfterSeconds: 10,
      unavailable: true
    };
  }

  try {
    const result = await limiter.limit(identifier);
    if (result.success) {
      return {
        allowed: true,
        limit: result.limit,
        remaining: result.remaining,
        reset: result.reset
      };
    }

    return {
      allowed: false,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
      retryAfterSeconds: retryAfterSeconds(result.reset)
    };
  } catch {
    return {
      allowed: false,
      retryAfterSeconds: 10,
      unavailable: true
    };
  }
}

export function getClientIp(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const [firstIp] = forwarded.split(",").map((ip) => ip.trim()).filter(Boolean);
    if (firstIp) {
      return firstIp;
    }
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown-ip";
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function rateLimitLogin(request: NextRequest, email: string) {
  const ip = getClientIp(request);
  const normalizedEmail = normalizeEmail(email);

  const [ipDecision, emailDecision] = await Promise.all([
    evaluateLimit("login-ip", 5, "10 m", ip),
    evaluateLimit("login-email", 3, "15 m", `${normalizedEmail}:${ip}`)
  ]);

  if (ipDecision.allowed && emailDecision.allowed) {
    return {
      allowed: true as const,
      ipDecision,
      emailDecision
    };
  }

  const ipUnavailable = !ipDecision.allowed && ipDecision.unavailable;
  const emailUnavailable = !emailDecision.allowed && emailDecision.unavailable;

  if (ipUnavailable || emailUnavailable) {
    return {
      allowed: false as const,
      unavailable: true as const,
      retryAfterSeconds: 10
    };
  }

  const blockedDecisions = [ipDecision, emailDecision].filter(
    (decision): decision is Extract<RateLimitDecision, { allowed: false }> => !decision.allowed
  );
  const retryAfterSecondsValue = Math.max(...blockedDecisions.map((decision) => decision.retryAfterSeconds));

  return {
    allowed: false as const,
    retryAfterSeconds: retryAfterSecondsValue
  };
}

export async function rateLimitEmbajador(request: NextRequest, userId: string) {
  const ip = getClientIp(request);
  const decision = await evaluateLimit("embajador", 20, "2 m", `${userId}:${ip}`);

  if (!decision.allowed) {
    if (decision.unavailable) {
      return {
        allowed: true as const,
        unavailable: true as const
      };
    }
  }

  return decision;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function createRateLimitHtmlResponse(message: string, retryAfterSeconds: number) {
  const body = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Too Many Requests</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: Arial, sans-serif;
        background: #120d0a;
        color: #fff4e7;
        padding: 24px;
      }
      main {
        max-width: 640px;
        width: 100%;
        padding: 28px;
        border: 1px solid rgba(255, 228, 201, 0.18);
        border-radius: 20px;
        background: rgba(31, 22, 16, 0.96);
        box-shadow: 0 28px 80px rgba(0, 0, 0, 0.38);
      }
      p { line-height: 1.55; color: rgba(255, 244, 231, 0.82); }
      a {
        display: inline-block;
        margin-top: 12px;
        color: #ffd86c;
      }
      .meta {
        margin-top: 14px;
        font-size: 0.95rem;
        color: rgba(255, 244, 231, 0.7);
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Demasiadas solicitudes</h1>
      <p>${escapeHtml(message)}</p>
      <p class="meta">Intenta nuevamente en ${retryAfterSeconds} segundos.</p>
      <a href="/login">Volver al inicio de sesión</a>
    </main>
  </body>
</html>`;

  return new NextResponse(body, {
    status: 429,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Retry-After": String(retryAfterSeconds),
      "Cache-Control": "no-store"
    }
  });
}
