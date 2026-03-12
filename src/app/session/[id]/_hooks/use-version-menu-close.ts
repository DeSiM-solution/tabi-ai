import type { RefObject } from 'react';
import { useEffect } from 'react';

type UseVersionMenuCloseArgs = {
  isOpen: boolean;
  showHtmlView: boolean;
  menuRef: RefObject<HTMLDivElement | null>;
  setIsOpen: (next: boolean) => void;
};

export function useVersionMenuClose({
  isOpen,
  showHtmlView,
  menuRef,
  setIsOpen,
}: UseVersionMenuCloseArgs) {
  useEffect(() => {
    if (!isOpen) return;

    const closeMenu = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && menuRef.current?.contains(target)) return;
      setIsOpen(false);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setIsOpen(false);
    };

    const closeOnScroll = () => setIsOpen(false);

    window.addEventListener('mousedown', closeMenu);
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('scroll', closeOnScroll, true);
    window.addEventListener('blur', closeOnScroll);

    return () => {
      window.removeEventListener('mousedown', closeMenu);
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('scroll', closeOnScroll, true);
      window.removeEventListener('blur', closeOnScroll);
    };
  }, [isOpen, menuRef, setIsOpen]);

  useEffect(() => {
    if (showHtmlView) return;
    setIsOpen(false);
  }, [showHtmlView, setIsOpen]);
}
