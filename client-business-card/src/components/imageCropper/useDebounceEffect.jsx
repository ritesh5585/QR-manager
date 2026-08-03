import { useEffect } from 'react';

/**
 * Runs a debounced effect function after the given delay.
 *
 * @param {Function} fn - The effect callback function to run.
 * @param {number} waitTime - The debounce delay in milliseconds.
 * @param {Array<any>} deps - Dependency array to watch.
 */
export function useDebounceEffect(fn, waitTime, deps = []) {
  useEffect(() => {
    const t = setTimeout(() => {
      fn();
    }, waitTime);

    return () => {
      clearTimeout(t);
    };
  }, deps);
}
