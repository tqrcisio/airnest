import { setTimeout as sleep } from 'node:timers/promises';

export async function work(minMs: number, maxMs: number, signal?: AbortSignal) {
  await sleep(minMs + Math.random() * (maxMs - minMs), undefined, { signal });
}

export function failSometimes(probability: number, message: string) {
  if (Math.random() < probability) throw new Error(message);
}
