import axios from 'axios';
import { EventProcessorRequest } from '@agentic-client-server-base/shared-types';
import { env } from '../config/env';

const client = axios.create({
  baseURL: env.EVENT_PROCESSOR_URL,
  timeout: 5000,
  headers: { Authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` },
});

// Fire-and-forget, matching the non-blocking behavior of the old
// worker.postMessage handoff — the WS message loop must not stall waiting on
// the processor's full response, and the processor replies asynchronously via
// Redis pub/sub regardless. Failures are logged rather than thrown so a
// slow/unreachable processor can't take down socket handling.
export function submitEvent(message: Record<string, unknown>, user?: { id: string; email: string }): void {
  client.post('/internal/events', { message, user } satisfies EventProcessorRequest)
    .catch((err) => console.error('processor.client submitEvent failed:', err.message));
}
