/**
 * Module-level pub/sub store for coordinating open state across all CitationComponent
 * instances. When a citation popover opens, it announces itself so all other open
 * popovers can close (one-at-a-time behavior).
 *
 * This is intentionally a module-level singleton — all CitationComponents on the page
 * share the same store so announcements propagate across unrelated subtrees.
 */

type ActivePopoverListener = (activeInstanceId: string) => void;

const activePopoverListeners = new Set<ActivePopoverListener>();

/** Broadcast to all subscribers that the given citation instance is now active. */
export function announceActivePopover(citationInstanceId: string): void {
  for (const listener of activePopoverListeners) {
    listener(citationInstanceId);
  }
}

/**
 * Subscribe to active-popover announcements. Returns an unsubscribe function.
 * The listener receives the instance ID of the citation that just became active.
 */
export function subscribeToActivePopover(listener: ActivePopoverListener): () => void {
  activePopoverListeners.add(listener);
  return () => {
    activePopoverListeners.delete(listener);
  };
}
