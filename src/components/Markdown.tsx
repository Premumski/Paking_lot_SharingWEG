import { Fragment } from "react";
import { parseMarkdown, type Inline } from "@/lib/markdown";

function Inlines({ items }: { items: Inline[] }) {
  return <>{items.map((s, i) => (s.bold ? <strong key={i}>{s.text}</strong> : <Fragment key={i}>{s.text}</Fragment>))}</>;
}

/** Renders the safe Markdown subset as React elements (no HTML injection possible). */
export function Markdown({ text }: { text: string }) {
  const blocks = parseMarkdown(text);
  const out: React.ReactNode[] = [];
  let list: React.ReactNode[] = [];
  const flush = () => {
    if (list.length) out.push(<ul key={`ul${out.length}`}>{list}</ul>);
    list = [];
  };
  blocks.forEach((b, i) => {
    if (b.type === "li") {
      list.push(<li key={i}><Inlines items={b.inline} /></li>);
      return;
    }
    flush();
    const Tag = b.type;
    out.push(<Tag key={i}><Inlines items={b.inline} /></Tag>);
  });
  flush();
  return <div className="prose-lite">{out}</div>;
}
