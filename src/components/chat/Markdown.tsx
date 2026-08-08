import React from "react";

/**
 * Minimal markdown for copilot replies: bold, italics, inline code,
 * bullet/numbered lists, and heading lines. Anything richer stays literal —
 * this is a chat transcript, not a document renderer.
 */

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={key++} className="font-semibold">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      nodes.push(
        <code key={key++} className="rounded bg-raised px-1.5 py-0.5 font-mono text-[13px]">
          {token.slice(1, -1)}
        </code>
      );
    } else {
      nodes.push(<em key={key++}>{token.slice(1, -1)}</em>);
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let key = 0;

  const flushList = () => {
    if (!list) return;
    const items = list.items.map((item, i) => (
      <li key={i} className="leading-7">
        {renderInline(item)}
      </li>
    ));
    blocks.push(
      list.ordered ? (
        <ol key={key++} className="list-decimal space-y-1 pl-5">
          {items}
        </ol>
      ) : (
        <ul key={key++} className="list-disc space-y-1 pl-5">
          {items}
        </ul>
      )
    );
    list = null;
  };

  for (const line of lines) {
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const heading = line.match(/^\s*#{1,4}\s+(.*)$/);

    if (bullet) {
      if (list && list.ordered) flushList();
      list ??= { ordered: false, items: [] };
      list.items.push(bullet[1]);
    } else if (numbered) {
      if (list && !list.ordered) flushList();
      list ??= { ordered: true, items: [] };
      list.items.push(numbered[1]);
    } else {
      flushList();
      if (heading) {
        blocks.push(
          <p key={key++} className="font-semibold leading-7">
            {renderInline(heading[1])}
          </p>
        );
      } else if (line.trim() === "") {
        blocks.push(<div key={key++} className="h-2" aria-hidden="true" />);
      } else {
        blocks.push(
          <p key={key++} className="leading-7">
            {renderInline(line)}
          </p>
        );
      }
    }
  }
  flushList();

  return <div className="text-[15px]">{blocks}</div>;
}
