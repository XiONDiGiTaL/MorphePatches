/**
 * Parser for Google Voice voicemail notification emails.
 *
 * The real template looks like this (text/plain part, format=flowed):
 *
 *   <https://voice.google.com>
 *   Hello this message is for Sean I am calling with some important information
 *   about your medications ...
 *   play message
 *   <https://accounts.google.com/AccountChooser?Email=...&continue=...>
 *   YOUR ACCOUNT <https://voice.google.com> HELP CENTER
 *   This email was sent to you because ...
 *
 * The subject carries the caller ID ("New voicemail from (866) 787-6341") and,
 * on some templates, the length. There is no "Transcript:" label, and the body
 * may mention other phone numbers, so the caller is never read from the body.
 */

export type ParsedVoicemailEmail = {
  caller: string;
  number: string;
  durationMs: number;
  transcript: string;
  link: string;
};

const TRANSCRIPT_START = /^<?https:\/\/voice\.google\.com\/?>$/i;
const TRANSCRIPT_END = /^(play|listen)\s+message$/i;

export function parseVoiceEmail(subject: string, body: string): ParsedVoicemailEmail {
  const lines = body
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim());

  const fromSubject = subject.match(/new voicemail from\s+(.+)$/i)?.[1]?.trim() ?? '';
  const number = fromSubject.match(/\(?\+?\d[\d\s().-]{6,}\d\)?/)?.[0] ?? '';
  const name = fromSubject.replace(number, '').replace(/[()\s,-]+/g, ' ').trim();

  const start = lines.findIndex((line) => TRANSCRIPT_START.test(line));
  const end = lines.findIndex((line, index) => index > start && TRANSCRIPT_END.test(line));
  const block = start >= 0 ? lines.slice(start + 1, end > start ? end : undefined) : lines;

  const transcript = block
    .filter((line) => line && !line.startsWith('<') && !/^https?:/i.test(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  // "play message" opens the account chooser, which resolves to the message itself.
  const link = (
    body.match(/https:\/\/accounts\.google\.com\/AccountChooser\?[^\s<>"]+/)?.[0] ??
    body.match(/https:\/\/voice\.google\.com\/voicemail[^\s<>"]*/)?.[0] ??
    ''
  ).replace(/&amp;/g, '&');

  // "(0:23)" in the subject when a template includes it; a phone number never matches.
  const length = subject.match(/\((\d{1,2}):(\d{2})\)/);
  const durationMs = length ? (Number(length[1]) * 60 + Number(length[2])) * 1000 : 0;

  return { caller: name || number, number, durationMs, transcript, link };
}
