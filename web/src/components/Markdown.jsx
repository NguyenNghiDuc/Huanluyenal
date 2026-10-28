import React, { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import sql from "highlight.js/lib/languages/sql";
import markdown from "highlight.js/lib/languages/markdown";
import "highlight.js/styles/github-dark.css";
import CopyButton from "./CopyButton";
for (const [name, language] of Object.entries({
  javascript,
  typescript,
  python,
  json,
  bash,
  css,
  xml,
  sql,
  markdown,
}))
  hljs.registerLanguage(name, language);
function CodeBlock({ children }) {
  const child = React.Children.toArray(children).find(React.isValidElement);
  const text = String(child?.props.children ?? "").replace(/\n$/, "");
  const language =
    /language-([\w+-]+)/
      .exec(child?.props.className || "")?.[1]
      ?.toLowerCase() || "text";
  const html = useMemo(() => {
    if (text.length > 30000 || !hljs.getLanguage(language)) return null;
    try {
      return hljs.highlight(text, { language, ignoreIllegals: true }).value;
    } catch {
      return null;
    }
  }, [text, language]);
  return (
    <div className="code-block">
      <div className="code-toolbar">
        <span>{language}</span>
        <CopyButton text={text} label="Sao chép mã" />
      </div>
      <pre tabIndex={0}>
        {html === null ? (
          <code>{text}</code>
        ) : (
          <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} />
        )}
      </pre>
    </div>
  );
}
const components = {
  pre: CodeBlock,
  a: ({ node, children, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  // Avoid background requests to third-party image hosts in generated messages.
  img: ({ src, alt }) =>
    src ? (
      <a href={src} target="_blank" rel="noopener noreferrer">
        [Hình ảnh: {alt || "Mở ảnh"}]
      </a>
    ) : (
      <span>[Hình ảnh]</span>
    ),
  table: ({ node, ...props }) => (
    <div className="table-scroll" tabIndex={0}>
      <table {...props} />
    </div>
  ),
};
export default memo(function Markdown({ content }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
