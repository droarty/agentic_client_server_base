import { CSSProperties } from 'react';
import { MockEntry } from '../index';
import { ChatBody } from '@/components/layout/ChatBody';

const SAMPLE_MESSAGES = [
  { messageType: 'system', text: 'Welcome! Ask me anything to get started.' },
  { messageType: 'user-text', text: 'Can you read this message back to me?', authorEmail: 'demo@example.com' },
  { messageType: 'ai-ack', text: 'One moment, let me take a look…', authorEmail: 'Workflow Assistant' },
  { messageType: 'ai-reply', text: 'Sure — click the speaker icon on any bubble to hear it read aloud.', authorEmail: 'Workflow Assistant' },
];

const panelStyle: CSSProperties = { height: 320, width: 380, border: '1px solid #ddd', borderRadius: 6 };

export const chatBodyMocks: MockEntry[] = [
  {
    id: 'chat-body-tts-auto',
    label: 'TTS: auto-read (defaultToTTS: true)',
    group: 'ChatBody',
    render: () => (
      <div style={panelStyle}>
        <ChatBody messages={SAMPLE_MESSAGES} defaultToTTS={true} />
      </div>
    ),
  },
  {
    id: 'chat-body-tts-manual',
    label: 'TTS: manual click only (defaultToTTS: false)',
    group: 'ChatBody',
    render: () => (
      <div style={panelStyle}>
        <ChatBody messages={SAMPLE_MESSAGES} defaultToTTS={false} />
      </div>
    ),
  },
  {
    id: 'chat-body-tts-disabled',
    label: 'TTS: disabled (prop omitted)',
    group: 'ChatBody',
    render: () => (
      <div style={panelStyle}>
        <ChatBody messages={SAMPLE_MESSAGES} />
      </div>
    ),
  },
];
