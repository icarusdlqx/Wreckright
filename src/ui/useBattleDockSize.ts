import { useLayoutEffect, useRef } from 'react';

/** Reserve the actual command dock, including reports, when fitting the tactical map. */
export function useBattleDockSize(active = true) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const dock = ref.current;
    const app = dock?.closest<HTMLElement>('.app');
    if (!active || !dock || !app) return;
    const top = app.querySelector<HTMLElement>('.topbar');
    const measure = () => {
      app.style.setProperty('--battle-dock-height', `${Math.ceil(dock.getBoundingClientRect().height)}px`);
      if (top) app.style.setProperty('--battle-top', `${Math.ceil(top.getBoundingClientRect().height)}px`);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(dock);
    if (top) observer.observe(top);
    measure();
    return () => {
      observer.disconnect();
      app.style.removeProperty('--battle-dock-height');
      app.style.removeProperty('--battle-top');
    };
  }, [active]);
  return ref;
}
