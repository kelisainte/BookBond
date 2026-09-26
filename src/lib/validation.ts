import { z } from 'zod';
export class DomainError extends Error { constructor(message: string, public status = 400) { super(message); } }
export const uuid = z.uuid();
export const short = z.string().trim().min(1).max(180);
export const note = z.string().trim().max(4000);
export function requireValue(condition: unknown, message: string, status = 400): asserts condition {
  if (!condition) throw new DomainError(message,status);
}
