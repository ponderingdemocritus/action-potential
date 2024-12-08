import {
  type ClientEvent,
  type CoreEvent,
  type DiscordMessageReceived,
  type TweetReceived,
} from "../types/events";
import type { ActionRegistry } from "./actions";
import type { IntentExtractor } from "./intent";
import { Logger, type LoggerConfig, LogLevel } from "./logger";
import { EventProcessor, type ProcessedIntent } from "./processor";
import { Room } from "./room";
import { RoomManager } from "./roomManager";
import { type VectorDB } from "./vectorDb";

export interface EventEmitter<T extends { type: string }> {
  emit(event: T): Promise<void>;
  on<E extends T>(
    eventType: E["type"],
    handler: (event: E) => Promise<void>
  ): void;
  off<E extends T>(
    eventType: E["type"],
    handler: (event: E) => Promise<void>
  ): void;
}

export interface Client extends EventEmitter<CoreEvent> {
  id: string;
  type: string;
  listen(): Promise<void>;
  stop(): Promise<void>;
}

export interface CoreConfig {
  logging?: LoggerConfig;
}

export class Core implements EventEmitter<ClientEvent> {
  private clients: Map<string, Client> = new Map();
  private handlers: Map<string, Set<(event: ClientEvent) => Promise<void>>> =
    new Map();
  private processor: EventProcessor;
  private roomManager: RoomManager;
  private logger: Logger;
  public readonly vectorDb: VectorDB;

  constructor(
    processor: EventProcessor,
    roomManager: RoomManager,
    actionRegistry: ActionRegistry,
    intentExtractor: IntentExtractor,
    vectorDb: VectorDB,
    config?: CoreConfig
  ) {
    this.processor = processor;
    this.roomManager = roomManager;
    this.vectorDb = vectorDb;
    this.logger = new Logger(
      config?.logging ?? {
        level: LogLevel.INFO,
        enableColors: true,
        enableTimestamp: true,
      }
    );
  }

  public on<E extends ClientEvent>(
    eventType: E["type"],
    handler: (event: E) => Promise<void>
  ): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers
      .get(eventType)!
      .add(handler as (event: ClientEvent) => Promise<void>);
  }

  public off<E extends ClientEvent>(
    eventType: E["type"],
    handler: (event: E) => Promise<void>
  ): void {
    const handlers = this.handlers.get(eventType);
    if (handlers) {
      handlers.delete(handler as (event: ClientEvent) => Promise<void>);
    }
  }

  public async emit(event: ClientEvent): Promise<void> {
    this.logger.debug("Core.emit", "Received event", {
      type: event.type,
      source: event.source,
    });

    // Get or create room based on event context
    const room = await this.ensureRoom(event);
    this.logger.trace("Core.emit", "Ensured room", {
      roomId: room.id,
      platform: room.platform,
    });

    // Add event to room memory
    await this.roomManager.addMemory(room.id, event.content, {
      eventType: event.type,
      source: event.source,
      ...event.metadata,
    });
    this.logger.debug("Core.emit", "Added to room memory", { roomId: room.id });

    // Process with room context
    this.logger.trace("Core.emit", "Processing event", { roomId: room.id });
    const result = await this.processor.process(event, room);

    this.logger.debug("Core.emit", "Processed event", { result });

    // Execute actions and route events
    await this.executeIntentActions(result.intents);
    await this.routeSuggestedActions(result.suggestedActions);

    console.log("event.type", event.type);
    // Notify handlers
    const handlers = this.handlers.get(event.type);
    if (handlers) {
      this.logger.debug("Core.emit", "Notifying event handlers", {
        type: event.type,
        handlerCount: handlers.size,
      });
      await Promise.all(
        [...handlers].map((handler) => {
          this.logger.trace("Core.emit", "Calling handler", {
            type: event.type,
            metadata: { ...event.metadata, ...result.enrichedContext },
          });
          return handler({
            ...event,
            metadata: { ...event.metadata, ...result.enrichedContext },
          });
        })
      );
      this.logger.debug("Core.emit", "Finished notifying handlers", {
        type: event.type,
      });
    } else {
      this.logger.trace("Core.emit", "No handlers registered for event type", {
        type: event.type,
      });
    }
  }

  private async ensureRoom(event: ClientEvent): Promise<Room> {
    const platformId = this.getPlatformId(event);
    const platform = this.getPlatform(event);

    let room = await this.roomManager.getRoomByPlatformId(platformId, platform);

    if (!room) {
      room = await this.roomManager.createRoom(platformId, platform, {
        name: this.getRoomName(event),
        description: this.getRoomDescription(event),
        participants: this.getParticipants(event),
        metadata: event.metadata,
      });
    }

    return room;
  }

  private getPlatformId(event: ClientEvent): string {
    if (event.type === "tweet_received") {
      return (
        (event as TweetReceived).metadata?.conversationId ??
        (event as TweetReceived).tweetId
      );
    }
    return event.source;
  }

  private getPlatform(event: ClientEvent): string {
    return event.source;
  }

  private getRoomName(event: ClientEvent): string {
    if (event.type === "tweet_received") {
      return `Twitter Thread ${(event as TweetReceived).tweetId}`;
    }
    return `${event.source} Room`;
  }

  private getRoomDescription(event: ClientEvent): string {
    if (event.type === "tweet_received") {
      return `Twitter conversation thread starting with tweet ${
        (event as TweetReceived).tweetId
      }`;
    }
    return `Conversation room for ${event.source}`;
  }

  private getParticipants(event: ClientEvent): string[] {
    if (event.type === "tweet_received") {
      return [(event as TweetReceived).username];
    }
    return [];
  }

  private async executeIntentActions(
    intents: ProcessedIntent[]
  ): Promise<void> {
    this.logger.debug("Core.executeIntentActions", "Executing intents", {
      count: intents.length,
    });
    for (const intent of intents) {
      if (intent.action) {
        this.logger.trace("Core.executeIntentActions", "Executing action", {
          type: intent.type,
          action: intent.action,
          confidence: intent.confidence,
        });
        await this.executeAction(intent);
      }
    }
  }

  private async executeAction(intent: ProcessedIntent): Promise<void> {
    // Implementation of immediate actions
    // This could be things like database updates, logging, etc.
    this.logger.trace("Core.executeAction", "Executing action", {
      type: intent.type,
      action: intent.action,
      confidence: intent.confidence,
    });
  }

  private async routeSuggestedActions(actions: CoreEvent[]): Promise<void> {
    for (const action of actions) {
      await this.routeEvent(action);
    }
  }

  public registerClient(client: Client): void {
    this.logger.info("Core.registerClient", "Registering client", {
      id: client.id,
      type: client.type,
    });

    this.handlers.set(client.type, new Set());

    this.clients.set(client.id, client);
    client.listen().catch((err) => {
      this.logger.error("Core.registerClient", "Failed to start client", {
        id: client.id,
        error: err.message,
      });
    });
  }

  public removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.stop().catch((err) => {
        console.error(`Failed to stop client ${clientId}:`, err);
      });
      this.clients.delete(clientId);
    }
  }

  protected async routeEvent(event: CoreEvent): Promise<void> {
    this.logger.trace("Core.routeEvent", "Routing event", {
      type: event.type,
      target: event.target,
    });

    const targetClient = this.clients.get(event.target);
    if (targetClient) {
      await targetClient.emit(event);
      this.logger.debug("Core.routeEvent", "Event routed successfully", {
        type: event.type,
        target: event.target,
        clientType: targetClient.type,
      });
    } else {
      this.logger.warn("Core.routeEvent", "Target client not found", {
        type: event.type,
        target: event.target,
      });
    }
  }
}
