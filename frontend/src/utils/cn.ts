import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Menggabungkan class Tailwind secara kondisional dan menyelesaikan konflik.
 * clsx: Membuang nilai falsy (false, null, undefined).
 * twMerge: Memastikan class utilitas terakhir akan menang jika ada konflik spesifisitas.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}