export const PUBSUB_CHANNEL = 'multiplayer:chat';

export interface WorkerInput {
  message: Record<string, unknown>;
  user?: { id: string; email: string };
}

export interface DeliveryInstruction {
  frame: Buffer;
  socketIds: string[];
}
