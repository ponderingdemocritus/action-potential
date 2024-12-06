import { v4 as uuidv4 } from "uuid";

export interface RoomMetadata {
  name?: string;
  description?: string;
  participants?: string[];
  platform: string; // e.g., 'twitter', 'telegram', 'discord'
  platformSpecific?: Record<string, any>;
  createdAt: Date;
  lastActive: Date;
}

export interface Memory {
  id: string;
  roomId: string;
  content: string;
  timestamp: Date;
  metadata?: Record<string, any>;
  embedding?: number[]; // Vector embedding for similarity search
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
    this.id = uuidv4();
    this.metadata = {
      platform,
      createdAt: new Date(),
      lastActive: new Date(),
      ...metadata,
    };
  }

  public async addMemory(
    content: string,
    metadata?: Record<string, any>
  ): Promise<Memory> {
    const memory: Memory = {
      id: uuidv4(),
      roomId: this.id,
      content,
      timestamp: new Date(),
      metadata,
    };

    this.memories.push(memory);
    this.metadata.lastActive = new Date();

    return memory;
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
