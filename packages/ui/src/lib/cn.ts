/**
 * Conditional class names.
 *
 * Deliberately not `clsx` + `tailwind-merge`: this codebase composes variants through
 * explicit maps rather than by overriding utilities down a prop chain, so there is no
 * conflict for a merge step to resolve, and two dependencies would earn nothing.
 */
export type ClassValue = string | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
