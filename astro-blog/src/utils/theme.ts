// theme.ts - 主题切换相关工具函数
// Requirements: 5.2, 5.3, 5.4, 5.5

export type Theme = "light" | "dark";

/** 切换主题（light → dark，dark → light） */
export function toggleTheme(currentTheme: Theme): Theme {
  return currentTheme === "dark" ? "light" : "dark";
}

/** 从 localStorage 读取主题（try-catch 容错） */
export function getStoredTheme(storage?: Storage): Theme | null {
  try {
    const s = storage ?? localStorage;
    const stored = s.getItem("theme");
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // localStorage 不可用，忽略
  }
  return null;
}

/** 存储主题到 localStorage（try-catch 容错） */
export function storeTheme(theme: Theme, storage?: Storage): void {
  try {
    const s = storage ?? localStorage;
    s.setItem("theme", theme);
  } catch {
    // localStorage 不可用，忽略
  }
}

/** 检测系统主题偏好 */
export function getSystemTheme(matchMedia?: (query: string) => MediaQueryList): Theme {
  try {
    const mql = matchMedia
      ? matchMedia("(prefers-color-scheme: dark)")
      : window.matchMedia("(prefers-color-scheme: dark)");
    return mql.matches ? "dark" : "light";
  } catch {
    return "light";
  }
}
