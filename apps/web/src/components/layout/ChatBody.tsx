import { useRef, useEffect, useState } from 'react';
import { Volume2, Square } from 'lucide-react';
import { MultiFieldInput } from './MultiFieldInput';
import { MultipleChoiceQuiz } from './MultipleChoiceQuiz';
import { Button } from '../ui/button';

interface FieldDef {
  name: string;
  label: string;
  placeholder?: string;
}

interface QuizOption {
  key: string;
  label: string;
  feedback: string;
}

interface ChatMessage {
  id?: string;
  messageType: string;
  text?: string;
  authorEmail?: string;
  color?: string;
  fields?: FieldDef[];
  submitLabel?: string;
  inputs?: Record<string, string> | null;
  question?: string;
  correctKey?: string;
  options?: QuizOption[];
  answer?: string | null;
  emits?: Record<string, string>;
}

interface Props {
  messages?: ChatMessage[];
  inputValues?: Record<string, string>;
  emit?: (type: string, payload: Record<string, unknown>) => void;
  defaultToTTS?: boolean;
  [key: string]: unknown;
}

function messageText(msg: ChatMessage): string | undefined {
  if (msg.text === undefined) return undefined;
  if (typeof msg.text !== 'string') {
    console.warn('ChatBody: expected string message text, got', msg.text);
    return undefined;
  }
  return msg.text;
}

export function ChatBody({ messages = [], inputValues, emit, defaultToTTS }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const prevLengthRef = useRef(messages.length);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  const handleSpeak = (text: string, index: number) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    if (speakingIndex === index) {
      setSpeakingIndex(null);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setSpeakingIndex(null);
    utterance.onerror = () => setSpeakingIndex(null);
    setSpeakingIndex(index);
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if (defaultToTTS && messages.length > prevLengthRef.current) {
      const lastIndex = messages.length - 1;
      const lastMessage = messages[lastIndex];
      const lastText = lastMessage ? messageText(lastMessage) : undefined;
      if (
        lastText &&
        lastMessage.messageType !== 'multi-field-input' &&
        lastMessage.messageType !== 'multiple-choice-quiz'
      ) {
        handleSpeak(lastText, lastIndex);
      }
    }
    prevLengthRef.current = messages.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, defaultToTTS]);

  return (
    <div className="chat-messages">
      {messages.length === 0 && (
        <p className="chat-empty">No messages yet. Say hello!</p>
      )}
      {messages.map((msg, i) => (
        msg.messageType === 'multi-field-input'
          ? (
            <MultiFieldInput
              key={i}
              fields={msg.fields}
              submitLabel={msg.submitLabel}
              values={inputValues}
              inputs={msg.inputs ?? undefined}
              onSubmit={
                msg.emits?.submit && emit
                  ? (payload) => emit(msg.emits!['submit'], { ...(payload as Record<string, unknown>), formId: msg.id })
                  : undefined
              }
            />
          )
          : msg.messageType === 'multiple-choice-quiz'
          ? (
            <MultipleChoiceQuiz
              key={i}
              question={msg.question}
              options={msg.options}
              correctKey={msg.correctKey}
              answer={msg.answer ?? undefined}
              onAnswer={
                msg.emits?.answer && emit
                  ? (payload) => emit(msg.emits!['answer'], { ...(payload as Record<string, unknown>), formId: msg.id })
                  : undefined
              }
            />
          )
          : (
            <div
              key={i}
              className={`chat-message chat-message--${msg.messageType}`}
              style={msg.color ? { color: msg.color } : undefined}
            >
              <span className="chat-message__author">{msg.authorEmail}</span>
              <span className="chat-message__text">{messageText(msg)}</span>
              {defaultToTTS !== undefined && messageText(msg) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="chat-message__speak-btn"
                  aria-label={speakingIndex === i ? 'Stop reading' : 'Read message aloud'}
                  onClick={() => handleSpeak(messageText(msg)!, i)}
                >
                  {speakingIndex === i ? <Square size={14} /> : <Volume2 size={14} />}
                </Button>
              )}
            </div>
          )
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
