import * as React from 'react';

const QUERY = '(max-width: 767px)';

// Local change from shadcn 4.21.4: a store subscription instead of setState in an effect (react-hooks lint).
export function useIsMobile() {
  return React.useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(QUERY);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
