import { InboundMessage } from '@multiplayer-base/shared-types';

export const PUBSUB_CHANNEL = 'multiplayer:chat';

export interface WorkerInput {
  message: InboundMessage;
}

export interface DeliveryInstruction {
  frame: string;
  socketIds: string[];
}
