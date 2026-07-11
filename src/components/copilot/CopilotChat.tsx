import { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { supabase } from '@/integrations/supabase/client';
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation';
import { Message, MessageContent } from '@/components/ai-elements/message';
import { PromptInput, PromptInputTextarea, PromptInputSubmit, PromptInputFooter } from '@/components/ai-elements/prompt-input';
import { Shimmer } from '@/components/ai-elements/shimmer';
import { Tool, ToolHeader, ToolContent, ToolInput, ToolOutput } from '@/components/ai-elements/tool';
import { Button } from '@/components/ui/button';
import { Check, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';

interface Props { threadId: string }

export function CopilotChat({ threadId }: Props) {
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(null);
  const [authHeader, setAuthHeader] = useState<string | null>(null);

  // Load initial messages + auth token
  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!cancel && token) setAuthHeader(`Bearer ${token}`);

      const { data } = await supabase
        .from('copilot_messages')
        .select('id, role, content, parts, created_at')
        .eq('conversation_id', threadId)
        .order('created_at', { ascending: true });
      if (cancel) return;
      const msgs: UIMessage[] = (data ?? []).map((m: any) => ({
        id: m.id,
        role: m.role,
        parts: Array.isArray(m.parts) && m.parts.length
          ? m.parts
          : [{ type: 'text', text: m.content ?? '' }],
      }));
      setInitialMessages(msgs);
    })();
    return () => { cancel = true; };
  }, [threadId]);

  const transport = useMemo(() => {
    if (!authHeader) return null;
    return new DefaultChatTransport({
      api: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/copilot-agent`,
      headers: { Authorization: authHeader },
      body: { conversationId: threadId },
    });
  }, [authHeader, threadId]);

  if (!transport || initialMessages === null) {
    return <div className="flex-1 flex items-center justify-center text-muted-foreground">Loading…</div>;
  }

  return (
    <ChatInner key={threadId} threadId={threadId} transport={transport} initialMessages={initialMessages} />
  );
}

function ChatInner({
  threadId, transport, initialMessages,
}: { threadId: string; transport: DefaultChatTransport<UIMessage>; initialMessages: UIMessage[] }) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { messages, sendMessage, status, error, addToolResult } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
    onError: (e) => {
      console.error('[copilot]', e);
      toast.error(e.message || 'Copilot failed');
    },
  });

  useEffect(() => { inputRef.current?.focus(); }, [threadId, status]);

  const doSend = async () => {
    const text = input.trim();
    if (!text || status === 'submitted' || status === 'streaming') return;
    setInput('');
    const { data: sess } = await supabase.auth.getUser();
    if (sess.user) {
      await supabase.from('copilot_messages').insert({
        conversation_id: threadId,
        user_id: sess.user.id,
        role: 'user',
        content: text,
      });
    }
    sendMessage({ text });
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <Conversation className="flex-1">
        <ConversationContent>
          {messages.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg font-medium mb-1">How can I help?</p>
              <p className="text-sm">Ask about leaves, attendance, beats, retailers, targets — or ask me to do something.</p>
            </div>
          )}
          {messages.map((m) => (
            <MessageRow key={m.id} message={m} onApprove={addToolResult} />
          ))}
          {(status === 'submitted' || status === 'streaming') && (
            <div className="px-4"><Shimmer>Thinking…</Shimmer></div>
          )}
          {error && (
            <div className="mx-4 my-2 p-3 rounded bg-destructive/10 text-destructive text-sm">
              {error.message}
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="border-t bg-background">
        <PromptInput onSubmit={() => { void doSend(); }}>
          <PromptInputTextarea
            ref={inputRef as any}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything…"
            disabled={status === 'submitted' || status === 'streaming'}
          />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} disabled={!input.trim()} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}

function MessageRow({
  message, onApprove,
}: { message: UIMessage; onApprove: (r: { tool: string; toolCallId: string; output: unknown }) => void }) {
  return (
    <Message from={message.role as any}>
      <MessageContent>
        {message.parts.map((part: any, idx) => {
          if (part.type === 'text') {
            if (message.role === 'assistant') {
              return (
                <div key={idx} className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{part.text}</ReactMarkdown>
                </div>
              );
            }
            return <p key={idx} className="whitespace-pre-wrap">{part.text}</p>;
          }
          // Tool part rendering (AI SDK v7: part.type === "tool-<name>")
          if (typeof part.type === 'string' && part.type.startsWith('tool-')) {
            const toolName = part.type.slice(5);
            const state = part.state as string | undefined;
            const needsApproval = state === 'input-available' && (part as any).requiresApproval;
            return (
              <Tool key={idx} defaultOpen={false}>
                <ToolHeader type={toolName as any} state={state as any} />
                <ToolContent>
                  <ToolInput input={part.input} />
                  {state === 'output-available' && (
                    <ToolOutput output={<pre className="text-xs overflow-auto">{JSON.stringify(part.output, null, 2)}</pre>} errorText={undefined} />
                  )}
                  {needsApproval && (
                    <div className="p-3 border-t flex gap-2 items-center bg-muted/50">
                      <span className="text-xs flex-1">This will make a change. Approve?</span>
                      <Button size="sm" variant="outline"
                        onClick={() => onApprove({ tool: toolName, toolCallId: part.toolCallId, output: { denied: true } })}>
                        <X className="w-3 h-3 mr-1" /> Deny
                      </Button>
                      <Button size="sm"
                        onClick={() => onApprove({ tool: toolName, toolCallId: part.toolCallId, output: { approved: true } })}>
                        <Check className="w-3 h-3 mr-1" /> Approve
                      </Button>
                    </div>
                  )}
                </ToolContent>
              </Tool>
            );
          }
          return null;
        })}
      </MessageContent>
    </Message>
  );
}
