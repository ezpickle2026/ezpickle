import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** ₱ from centavos. All money in EzPickle is stored as integer centavos. */
export function peso(centavos: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: centavos % 100 === 0 ? 0 : 2,
  }).format(centavos / 100);
}
