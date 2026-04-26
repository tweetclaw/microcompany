import { Suspense, lazy } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './MarkdownRenderer.css';

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
}

const CodeBlock = lazy(() => import('./CodeBlock').then((module) => ({ default: module.CodeBlock })));

function isIncompleteCodeBlock(content: string): boolean {
  const codeBlockMatches = content.match(/```/g);
  return codeBlockMatches !== null && codeBlockMatches.length % 2 !== 0;
}

export function MarkdownRenderer({ content, isStreaming = false }: MarkdownRendererProps) {
  let processedContent = content;
  if (isStreaming && isIncompleteCodeBlock(content)) {
    processedContent = content + '\n```';
  }

  return (
    <div className="markdown-renderer">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const code = String(children).replace(/\n$/, '');

            return match ? (
              <Suspense
                fallback={
                  <pre className="inline-code">
                    <code>{code}</code>
                  </pre>
                }
              >
                <CodeBlock language={match[1]} code={code} />
              </Suspense>
            ) : (
              <code className="inline-code" {...props}>
                {children}
              </code>
            );
          }
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
