import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

type ContentItem = { source: string; text: string };
type ContentContextValue = {
  content: Map<string, string>;
  ready: boolean;
  text: (key: string, fallback?: string) => string;
  format: (
    key: string,
    values: Record<string, string | number>,
    fallback?: string,
  ) => string;
};

const ContentContext = createContext<ContentContextValue>({
  content: new Map(),
  ready: false,
  text: (_key, fallback) => fallback ?? "",
  format: (key, values, fallback) =>
    Object.entries(values).reduce(
      (value, [name, replacement]) =>
        value.replaceAll(`{${name}}`, String(replacement)),
      fallback ?? key,
    ),
});

function replaceText(root: ParentNode, content: Map<string, string>) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const source = node.nodeValue?.replace(/\s+/g, " ").trim();
    const next = source ? content.get(source) : null;
    if (next && node.nodeValue !== next) node.nodeValue = next;
  }
  const attrs = ["aria-label", "title", "placeholder", "alt"];
  document.querySelectorAll<HTMLElement>("*").forEach((element) => {
    for (const attr of attrs) {
      const source = element.getAttribute(attr);
      if (!source) continue;
      const next = content.get(source.replace(/\s+/g, " ").trim());
      if (next && next !== source) element.setAttribute(attr, next);
    }
  });
}

export function DynamicContent({ children }: { children: ReactNode }) {
  const [content, setContent] = useState<Map<string, string> | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/ui-content")
      .then((response) => (response.ok ? response.json() : { items: [] }))
      .then((payload: { items?: ContentItem[] }) => {
        if (!alive) return;
        setContent(
          new Map(
            (payload.items || []).map((item) => [item.source, item.text]),
          ),
        );
      })
      .catch(() => alive && setContent(new Map()));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!content) return;
    replaceText(document, content);
    const observer = new MutationObserver(() => replaceText(document, content));
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });
    return () => observer.disconnect();
  }, [content]);
  const value = useMemo(
    () => ({
      content: content || new Map<string, string>(),
      ready: !!content,
      text: (key: string, fallback?: string) =>
        content?.get(key) || fallback || "",
      format: (
        key: string,
        values: Record<string, string | number>,
        fallback?: string,
      ) =>
        Object.entries(values).reduce(
          (value, [name, replacement]) =>
            value.replaceAll(`{${name}}`, String(replacement)),
          content?.get(key) || fallback || "",
        ),
    }),
    [content],
  );
  return (
    <ContentContext.Provider value={value}>{children}</ContentContext.Provider>
  );
}

export function useContent() {
  return useContext(ContentContext);
}
