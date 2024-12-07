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

interface Cluster {
  id: string;
  name: string;
  description: string;
  centroid?: number[];
  topics: string[];
  documentCount: number;
  lastUpdated: Date;
}

interface ClusterMetadata {
  clusterId: string;
  confidence: number;
  topics: string[];
}

interface MemoryWithTimestamp {
  content: string;
  timestamp: Date;
}

// Helper function to check if value is valid for Date constructor
function isValidDateValue(value: unknown): value is string | number | Date {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    value instanceof Date
  );
}

export class ChromaVectorDB implements VectorDB {
  private client: ChromaClient;
  private embedder: OpenAIEmbeddingFunction;
  private logger: Logger;
  private collectionName: string;
  static readonly CLUSTER_COLLECTION = "clusters";

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

  private async getClusterCollection() {
    return await this.client.getOrCreateCollection({
      name: ChromaVectorDB.CLUSTER_COLLECTION,
      embeddingFunction: this.embedder,
      metadata: {
        description: "Cluster centroids for hierarchical memory organization",
      },
    });
  }

  private async findOrCreateCluster(
    content: string,
    metadata: Record<string, any>
  ): Promise<ClusterMetadata> {
    const clusterCollection = await this.getClusterCollection();

    // Find most relevant cluster
    const results = await clusterCollection.query({
      queryTexts: [content],
      nResults: 1,
    });

    if (results.distances?.[0]?.[0] && results.distances[0][0] < 0.3) {
      // Use existing cluster if similarity is high
      const topics = ((results.metadatas?.[0]?.[0]?.topics as string) || "")
        .split(",")
        .filter(Boolean);

      return {
        clusterId: results.ids[0][0],
        confidence: 1 - (results.distances[0][0] || 0),
        topics,
      };
    }

    // Create new cluster if no good match
    const clusterId = crypto.randomUUID();
    const topics = Array.isArray(metadata.topics) ? metadata.topics : [];

    await clusterCollection.add({
      ids: [clusterId],
      documents: [content],
      metadatas: [
        {
          topics: topics.join(","),
          documentCount: 1,
          lastUpdated: new Date().toISOString(),
        },
      ],
    });

    return {
      clusterId,
      confidence: 1,
      topics,
    };
  }

  public async storeInRoom(
    content: string,
    roomId: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const collection = await this.getCollectionForRoom(roomId);
      const id = Room.createDeterministicMemoryId(roomId, content);
      const timestamp = new Date(metadata?.timestamp || Date.now());

      const clusterInfo = await this.findOrCreateCluster(
        content,
        metadata || {}
      );

      await collection.modify({
        metadata: {
          ...collection.metadata,
          lastActive: new Date().toISOString(),
        },
      });

      // Store with cluster information, converting arrays to strings
      await collection.add({
        ids: [id],
        documents: [content],
        metadatas: [
          {
            ...metadata,
            roomId,
            clusterId: clusterInfo.clusterId,
            clusterConfidence: clusterInfo.confidence,
            clusterTopics: clusterInfo.topics.join(","),
            timestamp: timestamp.toISOString(),
          },
        ],
      });

      this.logger.debug("ChromaVectorDB.storeInRoom", "Stored content", {
        roomId,
        contentLength: content.length,
        memoryId: id,
        clusterId: clusterInfo.clusterId,
        clusterConfidence: clusterInfo.confidence,
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
      const clusterInfo = await this.findOrCreateCluster(
        content,
        metadata || {}
      );

      const results = await collection.query({
        queryTexts: [content],
        nResults: limit * 2,
        where: {
          ...metadata,
          clusterId: clusterInfo.clusterId,
        },
      });

      if (!results.ids.length || !results.distances?.length) {
        return this.findSimilarInRoomGlobal(content, roomId, limit, metadata);
      }

      // Process and rank results with proper timestamp handling
      const processedResults = results.ids[0].map(
        (id: string, index: number) => {
          const metadata = results.metadatas?.[0]?.[index];
          const timestamp =
            metadata?.timestamp && isValidDateValue(metadata.timestamp)
              ? new Date(metadata.timestamp)
              : new Date();

          return {
            id,
            content: results.documents[0][index] || "",
            similarity: 1 - (results.distances?.[0]?.[index] || 0),
            metadata: {
              ...metadata,
              timestamp: timestamp.toISOString(),
            },
          };
        }
      );

      return processedResults
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
    } catch (error) {
      this.logger.error("ChromaVectorDB.findSimilarInRoom", "Search failed", {
        error: error instanceof Error ? error.message : String(error),
        roomId,
      });
      return [];
    }
  }

  private async findSimilarInRoomGlobal(
    content: string,
    roomId: string,
    limit: number = 5,
    metadata?: Record<string, any>
  ): Promise<SearchResult[]> {
    const collection = await this.getCollectionForRoom(roomId);
    const results = await collection.query({
      queryTexts: [content],
      nResults: limit,
      where: metadata,
    });

    if (!results.ids.length || !results.distances?.length) {
      return [];
    }

    return results.ids[0].map((id: string, index: number) => {
      const metadata = results.metadatas?.[0]?.[index];
      const timestamp =
        metadata?.timestamp && isValidDateValue(metadata.timestamp)
          ? new Date(metadata.timestamp)
          : new Date();

      return {
        id,
        content: results.documents[0][index] || "",
        similarity: 1 - (results.distances?.[0]?.[index] || 0),
        metadata: {
          ...metadata,
          timestamp: timestamp.toISOString(),
        },
      };
    });
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
