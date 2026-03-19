import { AnyMessage } from '@multiplayer-base/shared-types';

export const PUBSUB_CHANNEL = 'multiplayer:chat';

export interface WorkerInput {
  channel: string;
  message: AnyMessage;
}

export interface DeliveryInstruction {
  frame: string;
  socketIds: string[];
}
