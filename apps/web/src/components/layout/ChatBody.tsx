interface ChatMessage {
  messageType: string;
  text: string;
  authorEmail?: string;
  color?: string;
}

interface Props {
  messages?: ChatMessage[];
  [key: string]: unknown;
}

export function ChatBody({ messages = [] }: Props) {
  return (
    <div className="chat-messages">
      {messages.map((msg, i) => (
        <div
          key={i}
          className={`chat-message chat-message--${msg.messageType}`}
          style={msg.color ? { color: msg.color } : undefined}
        >
          <span className="chat-message__author">{msg.authorEmail}</span>
          <span className="chat-message__text">{msg.text}</span>
        </div>
      ))}
    </div>
  );
}
