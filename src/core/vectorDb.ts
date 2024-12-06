export interface SearchResult {
  id: string;
  content: string;
  similarity: number;
  metadata?: Record<string, any>;
}

export interface VectorDB {
  findSimilar(content: string, limit?: number, metadata?: Record<string, any>): Promise<SearchResult[]>;
  store(content: string, metadata?: Record<string, any>): Promise<void>;
  delete(id: string): Promise<void>;
} 