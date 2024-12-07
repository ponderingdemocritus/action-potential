import { Room } from "./room";
import type { Memory, RoomMetadata } from "./room";
import { ChromaVectorDB } from "./vectorDb";
import { Logger, LogLevel } from "./logger";

export class RoomManager {
  private logger: Logger;

  constructor(
    private vectorDb?: ChromaVectorDB,
    config: {
      logLevel?: LogLevel;
    } = {}
  ) {
    this.logger = new Logger({
      level: config.logLevel || LogLevel.INFO,
      enableColors: true,
      enableTimestamp: true,
    });
  }

  public async getRoom(roomId: string): Promise<Room | undefined> {
    if (!this.vectorDb) {
      this.logger.warn("RoomManager.getRoom", "No VectorDB provided");
      return undefined;
    }

    try {
      const collection = await this.vectorDb.getCollectionForRoom(roomId);
      const metadata = collection.metadata;

      if (!metadata?.platform || !metadata?.platformId) {
        this.logger.warn(
          "RoomManager.getRoom",
          "Room missing required metadata",
          {
            roomId,
          }
        );
        return undefined;
      }

      return new Room(
        metadata.platformId as string,
        metadata.platform as string,
        {
          name: metadata.name as string,
          description: metadata.description as string,
          participants: metadata.participants as string[],
          createdAt: new Date(metadata.created as string | number | Date),
          lastActive: new Date(
            (metadata.lastActive || metadata.created) as string | number | Date
          ),
        }
      );
    } catch (error) {
      this.logger.error("RoomManager.getRoom", "Failed to get room", {
        error: error instanceof Error ? error.message : String(error),
        roomId,
      });
      return undefined;
    }
  }

  public async getRoomByPlatformId(
    platformId: string,
    platform: string
  ): Promise<Room | undefined> {
    const roomId = Room.createDeterministicId(platform, platformId);
    return this.getRoom(roomId);
  }

  public async createRoom(
    platformId: string,
    platform: string,
    metadata?: Partial<RoomMetadata>
  ): Promise<Room> {
    if (!this.vectorDb) {
      throw new Error("VectorDB required for room creation");
    }

    const room = new Room(platformId, platform, metadata);

    try {
      // Initialize room in VectorDB with full metadata
      const collection = await this.vectorDb.getCollectionForRoom(room.id);

      // Update collection with full room metadata
      await collection.modify({
        metadata: {
          description: "Room-specific memory storage",
          roomId: room.id,
          platform: room.platform,
          platformId: room.platformId,
          created: room.getMetadata().createdAt.toISOString(),
          lastActive: room.getMetadata().lastActive.toISOString(),
          name: metadata?.name,
          participants: metadata?.participants,
        },
      });

      this.logger.debug("RoomManager.createRoom", "Room collection created", {
        roomId: room.id,
        platform,
        platformId,
      });

      return room;
    } catch (error) {
      this.logger.error(
        "RoomManager.createRoom",
        "Failed to create room collection",
        {
          error: error instanceof Error ? error.message : String(error),
          roomId: room.id,
        }
      );
      throw error;
    }
  }

  public async addMemory(
    roomId: string,
    content: string,
    metadata?: Record<string, any>
  ): Promise<Memory> {
    if (!this.vectorDb) {
      throw new Error("VectorDB required for adding memories");
    }

    const room = await this.getRoom(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }

    const memory = await room.addMemory(content, metadata);

    // Store in room-specific collection
    await this.vectorDb.storeInRoom(memory.content, room.id, {
      memoryId: memory.id,
      timestamp: memory.timestamp,
      platform: room.platform,
      ...metadata,
    });

    return memory;
  }

  public async findSimilarMemoriesInRoom(
    content: string,
    roomId: string,
    limit = 5
  ): Promise<Memory[]> {
    if (!this.vectorDb) {
      throw new Error("VectorDB required for finding memories");
    }

    const results = await this.vectorDb.findSimilarInRoom(
      content,
      roomId,
      limit
    );

    return results.map((result) => ({
      id: result.metadata?.memoryId,
      roomId: roomId,
      content: result.content,
      timestamp: new Date(result.metadata?.timestamp),
      metadata: result.metadata,
    }));
  }

  public async listRooms(): Promise<Room[]> {
    if (!this.vectorDb) {
      return [];
    }

    const roomIds = await this.vectorDb.listRooms();
    const rooms: Room[] = [];

    for (const roomId of roomIds) {
      const room = await this.getRoom(roomId);
      if (room) {
        rooms.push(room);
      }
    }

    return rooms;
  }

  public async deleteRoom(roomId: string): Promise<void> {
    if (!this.vectorDb) {
      return;
    }

    await this.vectorDb.deleteRoom(roomId);
    this.logger.info("RoomManager.deleteRoom", "Room deleted", { roomId });
  }
}
