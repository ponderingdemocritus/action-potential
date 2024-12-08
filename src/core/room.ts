import { createHash } from "crypto";

export interface RoomMetadata {
  name: string;
  description?: string;
  participants: string[];
  createdAt: Date;
  lastActive: Date;
  metadata?: Record<string, any>;
}

export interface Memory {
  id: string;
  roomId: string;
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
  embedding?: number[];
}

export class Room {
  public readonly id: string;
  private memories: Memory[] = [];
  private metadata: RoomMetadata;

  constructor(
    public readonly platformId: string, // e.g., tweet thread ID, chat ID
    public readonly platform: string,
    metadata?: Partial<RoomMetadata>
  ) {
    this.id = Room.createDeterministicId(platform, platformId);

    this.metadata = {
      name: metadata?.name || `Room ${platformId}`,
      description: metadata?.description,
      participants: metadata?.participants || [],
      createdAt: metadata?.createdAt || new Date(),
      lastActive: metadata?.lastActive || new Date(),
      metadata: metadata?.metadata,
    };
  }

  public static createDeterministicId(
    platform: string,
    platformId: string
  ): string {
    const hash = createHash("sha256")
      .update(`${platform}:${platformId}`)
      .digest("hex")
      .slice(0, 16);

    return `${platform}_${hash}`;
  }

  public async addMemory(
    content: string,
    metadata?: Record<string, any>
  ): Promise<Memory> {
    // Create deterministic memory ID based on room ID and content
    const memoryId = Room.createDeterministicMemoryId(this.id, content);

    const memory: Memory = {
      id: memoryId,
      roomId: this.id,
      content,
      timestamp: new Date(),
      metadata,
    };

    this.memories.push(memory);
    this.metadata.lastActive = new Date();

    return memory;
  }

  public static createDeterministicMemoryId(
    roomId: string,
    content: string
  ): string {
    const hash = createHash("sha256")
      .update(`${roomId}:${content}`)
      .digest("hex")
      .slice(0, 16);

    return `mem_${hash}`;
  }

  public getMemories(limit?: number): Memory[] {
    return limit ? this.memories.slice(-limit) : this.memories;
  }

  public getMetadata(): RoomMetadata {
    return { ...this.metadata };
  }

  public updateMetadata(update: Partial<RoomMetadata>): void {
    this.metadata = {
      ...this.metadata,
      ...update,
      lastActive: new Date(),
    };
  }

  public toJSON() {
    return {
      id: this.id,
      platformId: this.platformId,
      platform: this.platform,
      metadata: this.metadata,
      memories: this.memories,
    };
  }
}
