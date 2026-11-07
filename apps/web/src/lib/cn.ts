import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins class names; later Tailwind utilities win over conflicting earlier ones (w-auto over w-full). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
