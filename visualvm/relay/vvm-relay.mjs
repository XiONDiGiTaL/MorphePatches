#!/usr/bin/env node
/**
 * visualvm relay
 *
 * Bridges the carrier visual-voicemail mailbox (OMTP VVM is delivered over IMAP)
 * to the JSON shape the web app syncs. A browser cannot open an IMAP connection,
 * so this has to run somewhere that can: a laptop, a NAS, a Raspberry Pi.
 *
 *   IMAP_HOST=imap.example.com \
 *   IMAP_USER=5551234567 \
 *   IMAP_PASS=your-pin-or-password \
 *   VVM_TOKEN=$(openssl rand -hex 16) \
 *   CORS_ORIGIN=http://localhost:3001 \
 *   node vvm-relay.mjs
 *
 * Nothing is cached or written to disk; each request opens the mailbox, reads
 * the newest messages and returns them as base64 audio.
 */
import http from 'node:http';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

const PORT = Number(process.env.PORT || 8787);
const TOKEN = process.env.VVM_TOKEN || '';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const MAILBOX = process.env.IMAP_MAILBOX || 'INBOX';
const MAX_MESSAGES = Number(process.env.VVM_MAX || 25);

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. See the header of this file for the expected variables.`);
    process.exit(1);
  }
  return value;
}

const imapConfig = {
  host: required('IMAP_HOST'),
  port: Number(process.env.IMAP_PORT || 993),
  secure: process.env.IMAP_SECURE !== 'false',
  auth: { user: required('IMAP_USER'), pass: required('IMAP_PASS') },
  logger: false,
};

/** Pick the audio part out of a MIME message. */
function extractAudio(parsed) {
  const parts = parsed.attachments || [];
  const audio = parts.find((part) => (part.contentType || '').startsWith('audio/'));
  if (audio && audio.content) {
    return { mime: audio.contentType, buffer: audio.content };
  }

  // Some carriers put the recording in the body part rather than a MIME attachment.
  const body = parsed.html || parsed.text || '';
  if (Buffer.isBuffer(body) && body.length > 512) {
    return { mime: 'audio/wav', buffer: body };
  }
  return null;
}

function toIso(date) {
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}

async function readMailbox(limit) {
  const client = new ImapFlow(imapConfig);
  const messages = [];

  await client.connect();
  try {
    const lock = await client.getMailboxLock(MAILBOX);
    try {
      const status = await client.status(MAILBOX, { messages: true });
      const total = status.messages || 0;
      if (!total) return messages;

      const start = Math.max(1, total - limit + 1);
      for await (const message of client.fetch(`${start}:${total}`, {
        envelope: true,
        source: true,
        internalDate: true,
      })) {
        const parsed = await simpleParser(message.source);
        const audio = extractAudio(parsed);
        if (!audio) continue;

        const seconds = Number(
          (parsed.subject || '').match(/(\d+)\s*(?:s|sec|second)/i)?.[1] || 0,
        );

        messages.push({
          id: `${message.uid ?? message.seq}`,
          from: parsed.from?.value?.[0]?.name || '',
          number: (parsed.from?.value?.[0]?.address || '').replace(/[^\d+]/g, ''),
          receivedAt: toIso(message.internalDate || parsed.date),
          durationMs: seconds ? seconds * 1000 : 0,
          transcript: parsed.subject && !/^\d+s$/i.test(parsed.subject) ? parsed.subject : '',
          mime: audio.mime,
          audio: audio.buffer.toString('base64'),
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }

  return messages.reverse();
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (CORS_ORIGIN === '*' || (origin && CORS_ORIGIN.split(',').map((v) => v.trim()).includes(origin))) {
    response.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN === '*' ? '*' : origin);
  }
  response.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Vary', 'Origin');

  if (request.method === 'OPTIONS') {
    response.writeHead(204).end();
    return;
  }

  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

  if (url.pathname === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true }));
    return;
  }

  if (url.pathname !== '/vvm') {
    response.writeHead(404).end('Not found');
    return;
  }

  if (TOKEN) {
    const header = request.headers.authorization || '';
    if (header !== `Bearer ${TOKEN}`) {
      response.writeHead(401).end('Unauthorized');
      return;
    }
  }

  const limit = Math.min(Number(url.searchParams.get('limit') || MAX_MESSAGES), 100);

  try {
    const messages = await readMailbox(limit);
    response
      .writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify({ messages }));
  } catch (error) {
    console.error('Mailbox read failed:', error.message);
    response.writeHead(502, { 'content-type': 'application/json' }).end(
      JSON.stringify({ error: 'Mailbox read failed', detail: error.message }),
    );
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`VVM relay listening on http://0.0.0.0:${PORT} (mailbox: ${MAILBOX})`);
  if (!TOKEN) console.warn('VVM_TOKEN is unset, so the relay is open to anyone who can reach it.');
});
