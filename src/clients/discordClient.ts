// IMPLEMENTATION IN PROGRESS

import { type Core } from "../core/core";
import {
  type CoreEvent,
  type DiscordMessageReceived,
  type DiscordOutgoingEvent,
} from "../types/events";
import { BaseClient } from "./baseClient";

export class DiscordClient extends BaseClient {
  private discordClient: any;

  constructor(id: string, private token: string, core: Core) {
    super(id, "discord", core);
  }

  public async emit(event: CoreEvent): Promise<void> {
    if (this.isDiscordEvent(event)) {
      await this.handleDiscordEvent(event);
    }
  }

  private isDiscordEvent(event: CoreEvent): event is DiscordOutgoingEvent {
    return ["discord_message"].includes(event.type);
  }

  private async handleDiscordEvent(event: DiscordOutgoingEvent) {
    this.log("Sending Discord message", {
      channelId: event.channelId,
      content: event.content,
    });
  }

  async listen(): Promise<void> {
    if (this.isListening) return;

    this.isListening = true;

    try {
      this.discordClient = {
        on: (event: string, callback: Function) => {
          setInterval(() => {
            callback({
              content: "Hello from Discord! #tweet",
              channel: { id: "general" },
              author: { username: "user123" },
            });
          }, 30000);
        },
      };

      this.discordClient.on("messageCreate", async (message: any) => {
        const discordEvent: DiscordMessageReceived = {
          type: "discord_message_received",
          source: this.id,
          channelId: message.channel.id,
          content: message.content,
          username: message.author.username,
          timestamp: new Date(),
        };

        await this.core.emit(discordEvent);
      });

      this.log("Discord client started");
    } catch (error) {
      this.log("Failed to start Discord client", error);
      this.isListening = false;
    }
  }

  async stop(): Promise<void> {
    if (this.discordClient) {
      // Cleanup Discord client
    }
    await super.stop();
  }
}
