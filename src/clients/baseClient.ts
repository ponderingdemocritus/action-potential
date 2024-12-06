import { type Client, type Core } from "../core/core";
import { type CoreEvent } from "../types/events";

export abstract class BaseClient implements Client {
  protected isListening = false;
  protected handlers: Map<string, Set<(event: CoreEvent) => Promise<void>>> =
    new Map();

  constructor(
    public readonly id: string,
    public readonly type: string,
    protected core: Core
  ) {}

  public async emit(event: CoreEvent): Promise<void> {
    const handlers = this.handlers.get(event.type);
    if (handlers) {
      await Promise.all([...handlers].map((handler) => handler(event)));
    }
  }

  public on<E extends CoreEvent>(
    eventType: E["type"],
    handler: (event: E) => Promise<void>
  ): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers
      .get(eventType)!
      .add(handler as (event: CoreEvent) => Promise<void>);
  }

  public off<E extends CoreEvent>(
    eventType: E["type"],
    handler: (event: E) => Promise<void>
  ): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      handlers.delete(handler as (event: CoreEvent) => Promise<void>);
    }
  }

  abstract listen(): Promise<void>;

  async stop(): Promise<void> {
    this.isListening = false;
  }

  protected log(message: string, data?: any) {
    console.log(`[Client ${this.type}:${this.id}] ${message}`, data || "");
  }
}
