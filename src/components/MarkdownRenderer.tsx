import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './CodeBlock';
import './MarkdownRenderer.css';

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
}

function isIncompleteCodeBlock(content: string): boolean {
  const codeBlockMatches = content.match(/```/g);
  return codeBlockMatches !== null && codeBlockMatches.length % 2 !== 0;
}

export function MarkdownRenderer({ content, isStreaming = false }: MarkdownRendererProps) {
  // 如果正在流式传输且代码块未闭合,暂时添加闭合标记
  let processedContent = content;
  if (isStreaming && isIncompleteCodeBlock(content)) {
    processedContent = content + '\n```';
  }

  return (
    <div className="markdown-renderer">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const code = String(children).replace(/\n$/, '');

            return !inline && match ? (
              <CodeBlock language={match[1]} code={code} />
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
