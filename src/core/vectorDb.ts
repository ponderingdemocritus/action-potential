import { ChromaClient, OpenAIEmbeddingFunction } from "chromadb";
import { env } from "./env";
import { Logger, LogLevel } from "./logger";
import { Room } from "./room";

export interface SearchResult {
  id: string;
  content: string;
  similarity: number;
  metadata?: Record<string, any>;
}

export interface VectorDB {
  findSimilar(
    content: string,
    limit?: number,
    metadata?: Record<string, any>
  ): Promise<SearchResult[]>;
  store(content: string, metadata?: Record<string, any>): Promise<void>;
  delete(id: string): Promise<void>;
  storeInRoom?(
    content: string,
    roomId: string,
    metadata?: Record<string, any>
  ): Promise<void>;
  findSimilarInRoom?(
    content: string,
    roomId: string,
    limit?: number,
    metadata?: Record<string, any>
  ): Promise<SearchResult[]>;
}

export class ChromaVectorDB implements VectorDB {
  private client: ChromaClient;
  private embedder: OpenAIEmbeddingFunction;
  private logger: Logger;
  private collectionName: string;

  constructor(
    collectionName: string = "memories",
    config: {
      chromaUrl?: string;
      logLevel?: LogLevel;
    } = {}
  ) {
    this.collectionName = collectionName;
    this.logger = new Logger({
      level: config.logLevel || LogLevel.INFO,
      enableColors: true,
      enableTimestamp: true,
    });

    this.client = new ChromaClient({
      path: config.chromaUrl || "http://localhost:8000",
    });

    this.embedder = new OpenAIEmbeddingFunction({
      openai_api_key: env.OPENAI_API_KEY,
      openai_model: "text-embedding-3-small",
    });
  }

  public async getCollection() {
    return await this.client.getOrCreateCollection({
      name: this.collectionName,
      embeddingFunction: this.embedder,
      metadata: {
        description: "Memory storage for AI consciousness",
      },
    });
  }

  public async findSimilar(
    content: string,
    limit: number = 5,
    metadata?: Record<string, any>
  ): Promise<SearchResult[]> {
    try {
      this.logger.debug("ChromaVectorDB.findSimilar", "Searching for content", {
        contentLength: content.length,
        limit,
        metadata,
      });

      const collection = await this.getCollection();
      const results = await collection.query({
        queryTexts: [content],
        nResults: limit,
        where: metadata, // Using 'where' instead of 'whereDocument'
      });

      if (!results.ids.length || !results.distances?.length) {
        return [];
      }

      // Format results
      return results.ids[0].map((id: string, index: number) => ({
        id,
        content: results.documents[0][index] || "",
        similarity: 1 - (results.distances?.[0]?.[index] || 0),
        metadata: results.metadatas?.[0]?.[index] || undefined,
      }));
    } catch (error) {
      this.logger.error("ChromaVectorDB.findSimilar", "Search failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  public async store(
    content: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const collection = await this.getCollection();
      // Use deterministic ID for global memories too
      const id = Room.createDeterministicMemoryId("global", content);

      this.logger.debug("ChromaVectorDB.store", "Storing content", {
        id,
        contentLength: content.length,
        metadata,
      });

      await collection.add({
        ids: [id],
        documents: [content],
        metadatas: metadata ? [metadata] : undefined,
      });
    } catch (error) {
      this.logger.error("ChromaVectorDB.store", "Failed to store content", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  public async delete(id: string): Promise<void> {
    try {
      const collection = await this.getCollection();
      this.logger.debug("ChromaVectorDB.delete", "Deleting content", { id });
      await collection.delete({
        ids: [id],
      });
    } catch (error) {
      this.logger.error("ChromaVectorDB.delete", "Failed to delete content", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  // Additional utility methods
  public async count(): Promise<number> {
    const collection = await this.getCollection();
    const results = await collection.count();
    return results;
  }

  public async clear(): Promise<void> {
    const collection = await this.getCollection();
    await collection.delete();
  }

  public async peek(limit: number = 5): Promise<SearchResult[]> {
    const collection = await this.getCollection();
    const results = await collection.peek({ limit });
    return results.ids.map((id: string, index: number) => {
      const content = results.documents[index];
      if (content === null) {
        throw new Error(`Document content is null for id ${id}`);
      }
      return {
        id,
        content,
        similarity: 1,
        metadata: results.metadatas?.[index] ?? undefined,
      };
    });
  }

  public async getCollectionForRoom(roomId: string) {
    const collectionName = `room_${roomId}`;
    return await this.client.getOrCreateCollection({
      name: collectionName,
      embeddingFunction: this.embedder,
      metadata: {
        description: "Room-specific memory storage",
        roomId,
        platform: roomId.split("_")[0],
        platformId: roomId.split("_")[1],
        created: new Date().toISOString(),
        lastActive: new Date().toISOString(),
      },
    });
  }

  public async storeInRoom(
    content: string,
    roomId: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const collection = await this.getCollectionForRoom(roomId);
      const id = Room.createDeterministicMemoryId(roomId, content);

      await collection.modify({
        metadata: {
          ...collection.metadata,
          lastActive: new Date().toISOString(),
        },
      });

      await collection.add({
        ids: [id],
        documents: [content],
        metadatas: [{ ...metadata, roomId }],
      });

      this.logger.debug("ChromaVectorDB.storeInRoom", "Stored content", {
        roomId,
        contentLength: content.length,
        memoryId: id,
      });
    } catch (error) {
      this.logger.error("ChromaVectorDB.storeInRoom", "Storage failed", {
        error: error instanceof Error ? error.message : String(error),
        roomId,
      });
      throw error;
    }
  }

  public async findSimilarInRoom(
    content: string,
    roomId: string,
    limit: number = 5,
    metadata?: Record<string, any>
  ): Promise<SearchResult[]> {
    try {
      const collection = await this.getCollectionForRoom(roomId);
      const results = await collection.query({
        queryTexts: [content],
        nResults: limit,
        where: metadata,
      });

      if (!results.ids.length || !results.distances?.length) {
        return [];
      }

      return results.ids[0].map((id: string, index: number) => ({
        id,
        content: results.documents[0][index] || "",
        similarity: 1 - (results.distances?.[0]?.[index] || 0),
        metadata: results.metadatas?.[0]?.[index] || undefined,
      }));
    } catch (error) {
      this.logger.error("ChromaVectorDB.findSimilarInRoom", "Search failed", {
        error: error instanceof Error ? error.message : String(error),
        roomId,
      });
      return [];
    }
  }

  public async listRooms(): Promise<string[]> {
    const collections = await this.client.listCollections();
    return collections
      .filter((c) => c.name.startsWith("room_"))
      .map((c) => c.name.replace("room_", ""));
  }

  public async getRoomMemoryCount(roomId: string): Promise<number> {
    const collection = await this.getCollectionForRoom(roomId);
    return await collection.count();
  }

  public async deleteRoom(roomId: string): Promise<void> {
    try {
      await this.client.deleteCollection({ name: `room_${roomId}` });
      this.logger.info("ChromaVectorDB.deleteRoom", "Room deleted", { roomId });
    } catch (error) {
      this.logger.error("ChromaVectorDB.deleteRoom", "Deletion failed", {
        error: error instanceof Error ? error.message : String(error),
        roomId,
      });
      throw error;
    }
  }
}
