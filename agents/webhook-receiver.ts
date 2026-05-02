// Webhook receiver — Frontier track Day 1.
//
// Standalone Fastify process that ingests Helius enhanced webhook events,
// runs the native-token threshold filter, normalizes survivors into the
// supplier's internal Signal shape, and exposes them on a poll endpoint.
//
// Run independently of supplier/buyer:  npm run receiver
//
// Endpoints:
//   POST /helius/events     — Helius push (verifies Authorization header)
//   GET  /signals/next      — supplier poll (204 if empty)
//   GET  /health            — uptime + counters

import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import 'dotenv/config';
import Fastify from 'fastify';

import { passesThreshold, type HeliusEvent } from './lib/signal-filter.js';
import { normalize, type SourcedSignal } from './lib/signal-normalize.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = Number(process.env.WEBHOOK_RECEIVER_PORT ?? 4000);
const AUTH_HEADER = process.env.HELIUS_WEBHOOK_AUTH_HEADER ?? '';

if (!AUTH_HEADER) {
  console.error('FATAL: HELIUS_WEBHOOK_AUTH_HEADER not set in env. Refusing to start.');
  process.exit(1);
}

// ---------- logging ----------

const LOG_DIR = resolve(__dirname, 'logs');
if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

function logPath(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return resolve(LOG_DIR, `webhook-receiver-${date}.log`);
}

function log(event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), event, ...fields });
  process.stdout.write(line + '\n');
  try {
    appendFileSync(logPath(), line + '\n');
  } catch {
    // log file write failure is non-fatal; stdout still receives it
  }
}

// ---------- queue + dedup ----------

const QUEUE_CAP = 100;
const DEDUP_TTL_MS = 5 * 60 * 1000;

const queue: SourcedSignal[] = [];
const seenSig = new Map<string, number>();

function dedupSeen(sig: string): boolean {
  const ts = seenSig.get(sig);
  if (ts !== undefined && ts > Date.now() - DEDUP_TTL_MS) return true;
  seenSig.set(sig, Date.now());
  return false;
}

function dedupCleanup(): void {
  const cutoff = Date.now() - DEDUP_TTL_MS;
  for (const [sig, ts] of seenSig) {
    if (ts <= cutoff) seenSig.delete(sig);
  }
}

setInterval(dedupCleanup, 60_000).unref();

// ---------- counters ----------

const startedAt = Date.now();
let eventsReceivedToday = 0;
let eventsFilteredToday = 0;
let eventsForwardedToday = 0;
let lastEventAt: string | null = null;
let counterDay = new Date().toISOString().slice(0, 10);

function rolloverIfNewDay(): void {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== counterDay) {
    counterDay = today;
    eventsReceivedToday = 0;
    eventsFilteredToday = 0;
    eventsForwardedToday = 0;
  }
}

// ---------- fastify ----------

const app = Fastify({ logger: false, bodyLimit: 4 * 1024 * 1024 });

app.post('/helius/events', async (req, reply) => {
  const auth = req.headers['authorization'];
  if (auth !== AUTH_HEADER) {
    log('EVENT_AUTH_FAIL', { provided_present: typeof auth === 'string', remote: req.ip });
    return reply.code(401).send({ error: 'unauthorized' });
  }

  rolloverIfNewDay();

  // Helius posts an array of events per delivery.
  const body = req.body;
  const events: HeliusEvent[] = Array.isArray(body) ? body : [body as HeliusEvent];

  for (const ev of events) {
    eventsReceivedToday += 1;
    lastEventAt = new Date().toISOString();

    const sig = ev.signature ?? '';
    log('EVENT_RECEIVED', {
      sig: sig.slice(0, 16),
      slot: ev.slot,
      type: ev.type,
      source: ev.source,
      transfers: (ev.tokenTransfers ?? []).length,
    });

    if (!sig) {
      eventsFilteredToday += 1;
      log('SIGNAL_FILTERED', { reason: 'no_signature' });
      continue;
    }
    if (dedupSeen(sig)) {
      log('SIGNAL_DEDUP_SKIP', { sig: sig.slice(0, 16) });
      continue;
    }

    const filter = passesThreshold(ev);
    if (!filter.passes) {
      eventsFilteredToday += 1;
      log('SIGNAL_FILTERED', { sig: sig.slice(0, 16), reason: filter.reason });
      continue;
    }

    const signal = normalize(ev, filter);

    if (queue.length >= QUEUE_CAP) {
      const dropped = queue.shift()!;
      log('QUEUE_OVERFLOW_DROP', { dropped_id: dropped.id });
    }
    queue.push(signal);
    eventsForwardedToday += 1;
    log('SIGNAL_FORWARDED', {
      id: signal.id,
      sig: sig.slice(0, 16),
      matched_leg: filter.matchedLeg,
      queue_size: queue.length,
    });
  }

  return reply.code(200).send({ ok: true, received: events.length });
});

app.get('/signals/next', async (_req, reply) => {
  const next = queue.shift();
  if (!next) return reply.code(204).send();
  log('SIGNAL_DEQUEUED', { id: next.id, queue_size: queue.length });
  return reply.code(200).send(next);
});

app.get('/health', async () => {
  return {
    uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
    queue_size: queue.length,
    queue_capacity: QUEUE_CAP,
    events_received_today: eventsReceivedToday,
    events_filtered_today: eventsFilteredToday,
    events_forwarded_today: eventsForwardedToday,
    last_event_at: lastEventAt,
    counter_day: counterDay,
  };
});

// ---------- lifecycle ----------

async function shutdown(signal: string): Promise<void> {
  log('RECEIVER_STOPPING', { signal, queue_size: queue.length });
  try {
    await app.close();
  } catch (err) {
    log('RECEIVER_STOP_ERR', { err: String(err) });
  }
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

app
  .listen({ port: PORT, host: '127.0.0.1' })
  .then(() => {
    log('RECEIVER_STARTED', {
      port: PORT,
      auth_configured: true,
      queue_capacity: QUEUE_CAP,
      dedup_ttl_ms: DEDUP_TTL_MS,
    });
  })
  .catch((err) => {
    log('RECEIVER_START_FAILED', { err: String(err) });
    process.exit(1);
  });
