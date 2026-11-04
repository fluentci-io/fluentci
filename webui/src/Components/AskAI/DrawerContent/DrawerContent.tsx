import { FC, useRef, useState } from "react";
import { Robot, ArrowUpShort, StopFill } from "@styled-icons/bootstrap";
import {
  Avatar,
  Sample,
  TextAreaWrapper,
  Textarea,
  SendButton,
  Bubble,
  BubbleWrapper,
  Clear,
} from "./styles";
import { AnswerSession, Message, OramaClient } from "@oramacloud/client";
import { useRecoilState } from "recoil";
import { promptsState } from "../PromptsState";
import TypeWriterMarkdown from "../TypewriterMarkdown";

const orama = new OramaClient({
  endpoint: "https://cloud.orama.run/v1/indexes/docs-fluentci-io-rr701q",
  api_key: "1NBssCY5GlpVeFLDpglDHp6xLLS4g5vq",
});

const DrawerContent: FC = () => {
  const [rows, setRows] = useState(1);
  const [value, setValue] = useState("");
  const [prompts, setPrompts] = useRecoilState(promptsState);
  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [loadingResponse, setLoadingResponse] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_aborted, setAborted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState<AnswerSession | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const samples = [
    "How to deploy to Cloudflare?",
    "How does FluentCI work internally?",
    "How to run MySQL and Redis as a background service in my CI Pipeline?",
    "How do I create my own plugin?",
  ];

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const textAreaLineHeight = 64;
    const previousRows = e.target.rows;
    e.target.rows = rows;
    const currentRows = ~~(e.target.scrollHeight / textAreaLineHeight);

    if (currentRows === previousRows) {
      e.target.rows = currentRows;
    }

    setRows(currentRows < 10 ? currentRows : 10);
  };

  const onClickPrompt = (query: string) => {
    setValue("");
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    ask(query);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        setValue((value) => value + "\n");

        if (rows < 10) {
          setRows((rows) => rows + 1);
        }

        return;
      }

      const question = value.trim();
      setValue("");
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      ask(question);
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleSend = () => {
    if (value.trim().length === 0) {
      return;
    }

    const question = value.trim();
    setValue("");
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    ask(question);
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const ask = async (question: string) => {
    setLoadingResponse(true);
    const answerSession = orama.createAnswerSession({
      inferenceType: "documentation",
      // optional
      initialMessages,
      // optional
      events: {
        onMessageChange: (messages) => {
          setInitialMessages(
            messages.map((x) => ({
              role: x.role,
              content: x.content,
            }))
          );
        },
        onMessageLoading: (value) => setLoading(value),
        onAnswerAborted: (value) => setAborted(value),
        onStateChange: (state) => {
          if (state[0].response.length > 1) {
            setLoadingResponse(false);
          }

          setPrompts([
            ...prompts,
            ...[...state].map((s) => ({
              query: question,
              response: s.response,
              interactionId: s.interactionId,
            })),
          ]);
        },
      },
    });
    setSession(answerSession);
    await answerSession.ask({ term: question });
  };

  return (
    <>
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          padding: 23,
          paddingBottom: 0,
        }}
      >
        <Avatar>
          <Robot size={30} style={{ marginTop: -4 }} />
        </Avatar>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flex: 1,
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 18 }}>FluentCI AI</div>
          <div style={{ fontWeight: 600, color: "#02f3e6" }}>Assistant</div>
        </div>
        {prompts.length > 0 && (
          <Clear onClick={() => setPrompts([])}>Clear</Clear>
        )}
      </div>
      <div
        style={{
          height: "calc(100% - 167px)",
          overflowY: "auto",
          paddingLeft: 32,
          paddingRight: 32,
        }}
      >
        <div style={{ marginTop: 20, color: "#fff", marginBottom: 50 }}>
          Hi!
          <br />
          I'm an AI assistant trained to help you with your CI/CD needs.
          <br />
          How can I help you?
        </div>
        <div>
          <div style={{ color: "#cfe8fccf", marginBottom: 5 }}>
            Try something like
          </div>
          {samples.map((sample) => (
            <Sample key={sample} onClick={() => onClickPrompt(sample)}>
              {sample}
            </Sample>
          ))}
        </div>
        {prompts.map((prompt, index) => (
          <div key={prompt.interactionId} style={{ marginBottom: "5rem" }}>
            <BubbleWrapper>
              <Bubble>{prompt.query}</Bubble>
            </BubbleWrapper>
            <div className="markdown-body markdown-dark">
              <TypeWriterMarkdown
                markdown={prompt.response}
                chatEndRef={chatEndRef}
                loading={loadingResponse && prompts.length === index + 1}
              />
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>
      <TextAreaWrapper>
        <Textarea
          autoFocus={true}
          rows={rows}
          placeholder={"I want to ..."}
          onChange={onChange}
          onKeyDown={onKeyDown}
          value={value}
        />
        {!loading && (
          <SendButton enabled={value.trim().length > 0} onClick={handleSend}>
            <ArrowUpShort size={30} />
          </SendButton>
        )}
        {loading && (
          <SendButton enabled={true} onClick={() => session?.abortAnswer()}>
            <StopFill size={30} />
          </SendButton>
        )}
      </TextAreaWrapper>
    </>
  );
};

export default DrawerContent;
