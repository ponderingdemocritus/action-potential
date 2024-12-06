import { Room } from "./room";
import type { Memory, RoomMetadata } from "./room";
import { type VectorDB } from "./vectorDb";

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private platformRooms: Map<string, Set<string>> = new Map();

  constructor(private vectorDb?: VectorDB) {}

  public createRoom(
    platformId: string,
    platform: string,
    metadata?: Partial<RoomMetadata>
  ): Room {
    const room = new Room(platformId, platform, metadata);
    this.rooms.set(room.id, room);

    // Index by platform
    if (!this.platformRooms.has(platform)) {
      this.platformRooms.set(platform, new Set());
    }
    this.platformRooms.get(platform)!.add(room.id);

    return room;
  }

  public async addMemory(
    roomId: string,
    content: string,
    metadata?: Record<string, any>
  ): Promise<Memory> {
    const room = this.getRoom(roomId);
    if (!room) throw new Error(`Room ${roomId} not found`);

    const memory = await room.addMemory(content, metadata);

    // Store in vector DB if available
    if (this.vectorDb) {
      await this.vectorDb.store(memory.content, {
        memoryId: memory.id,
        roomId: room.id,
        platform: room.platform,
        timestamp: memory.timestamp,
        ...metadata,
      });
    }

    return memory;
  }

  public getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  public getRoomByPlatformId(
    platformId: string,
    platform: string
  ): Room | undefined {
    const roomIds = this.platformRooms.get(platform);
    if (!roomIds) return undefined;

    return Array.from(roomIds)
      .map((id) => this.rooms.get(id))
      .find((room) => room?.platformId === platformId);
  }

  public async findSimilarMemories(
    content: string,
    roomId?: string,
    limit = 5
  ): Promise<Memory[]> {
    if (!this.vectorDb) {
      throw new Error("Vector DB not configured");
    }

    const metadata = roomId ? { roomId } : undefined;

    const results = await this.vectorDb.findSimilar(content, limit, metadata);

    return results.map((result) => ({
      id: result?.metadata?.memoryId,
      roomId: result?.metadata?.roomId,
      content: result.content,
      timestamp: new Date(result.metadata?.timestamp),
      metadata: result.metadata,
    }));
  }

  public getRooms(): Map<string, Room> {
    return this.rooms;
  }
}
