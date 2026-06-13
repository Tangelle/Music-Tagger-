import { useState, useEffect, useCallback } from 'react';

export function useTheme() {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains('dark')
  );

  // 同步外部修改
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  const toggleTheme = useCallback(() => {
    const html = document.documentElement;
    const next = !html.classList.contains('dark');
    if (next) {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light');
    } catch (_) {
      // localStorage 不可用时忽略
    }
    setDark(next);
  }, []);

  return { dark, toggleTheme };
}
