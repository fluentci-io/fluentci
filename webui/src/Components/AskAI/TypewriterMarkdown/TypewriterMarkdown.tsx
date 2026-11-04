import { FC, ReactNode, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { a11yDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { Copy } from "@styled-icons/ionicons-outline";
import copy from "copy-to-clipboard";
import { StatefulTooltip } from "baseui/tooltip";
import { CopyButton } from "./styles";
import ContentLoader from "../ContentLoader";

const CopyButtonContainer: FC<{ children: ReactNode[] }> = ({ children }) => {
  const onCopy = () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const code = (children[0] as any).props.children[0] as string;
    copy(code);
  };
  return (
    <StatefulTooltip content="Copy">
      <CopyButton onClick={onCopy}>
        <Copy size={20} />
      </CopyButton>
    </StatefulTooltip>
  );
};

export type TypeWriterMarkdownProps = {
  markdown: string;
  speed?: number;
  chatEndRef: React.RefObject<HTMLDivElement>;
  loading?: boolean;
};
const TypeWriterMarkdown: FC<TypeWriterMarkdownProps> = ({
  markdown,
  speed,
  chatEndRef,
  loading,
}) => {
  const [displayedText, setDisplayedText] = useState("");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index < markdown.length && speed) {
      const timer = setTimeout(() => {
        setDisplayedText((prev) => prev + markdown.charAt(index));
        setIndex((prev) => prev + 1);
      }, speed);

      return () => clearTimeout(timer);
    }
  }, [index, markdown, speed]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayedText, chatEndRef]);

  if (loading) {
    return (
      <div style={{ marginTop: "2rem" }}>
        <ContentLoader
          speed={2}
          backgroundColor="#120732"
          foregroundColor="#2d1d5a"
        />
      </div>
    );
  }

  return (
    <ReactMarkdown
      components={{
        pre({ children, ...props }) {
          return (
            <pre {...props} style={{ position: "relative" }}>
              <CopyButtonContainer>{children}</CopyButtonContainer>
              {children}
            </pre>
          );
        },
        code({ inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "");
          return !inline && match ? (
            <SyntaxHighlighter
              {...props}
              children={String(children).replace(/\n$/, "")}
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              style={a11yDark}
              language={match[1]}
              PreTag="div"
            />
          ) : (
            <code {...props} className={className}>
              {children}
            </code>
          );
        },
      }}
      children={speed ? displayedText : markdown}
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw]}
    />
  );
};

export default TypeWriterMarkdown;
