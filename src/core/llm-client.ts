import Anthropic from "@anthropic-ai/sdk";
import { setTimeout } from "timers/promises";
import { env } from "./env";

export interface LLMResponse {
  text: string;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  metadata?: Record<string, unknown>;
}

export interface LLMClientConfig {
  provider: "anthropic";
  model?: string;
  maxRetries?: number;
  timeout?: number;
  temperature?: number;
  maxTokens?: number;
  apiKey?: string;
  baseDelay?: number;
  maxDelay?: number;
}

interface AnalysisOptions {
  role?: string;
  temperature?: number;
  maxTokens?: number;
  formatResponse?: boolean;
}

interface StructuredAnalysis {
  summary: string;
  reasoning: string;
  conclusion: string;
  confidenceLevel: number;
  caveats: string[];
}

export class LLMClient {
  private anthropic?: Anthropic;
  private readonly config: Required<LLMClientConfig>;
  private currentModel: string;

  constructor(config: LLMClientConfig) {
    this.config = {
      provider: config.provider,
      model: config.model || this.getDefaultModel(config.provider),
      maxRetries: config.maxRetries || 3,
      timeout: config.timeout || 30000,
      temperature: config.temperature || 0.3,
      maxTokens: config.maxTokens || 1000,
      apiKey: config.apiKey || this.getApiKeyFromEnv(config.provider),
      baseDelay: config.baseDelay || 1000,
      maxDelay: config.maxDelay || 10000,
    };

    this.currentModel = this.config.model;
    this.initializeClient();
  }

  private initializeClient(): void {
    this.anthropic = new Anthropic({
      apiKey: this.config.apiKey,
    });
  }

  public async complete(prompt: string): Promise<LLMResponse> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await this.executeCompletion(prompt);
      } catch (error) {
        lastError = error as Error;

        if (this.shouldRetry(error as Error, attempt)) {
          const delay = this.calculateBackoff(attempt);
          await setTimeout(delay);
          continue;
        }

        throw this.enhanceError(error as Error);
      }
    }

    throw this.enhanceError(lastError!);
  }

  public getModelName(): string {
    return this.currentModel;
  }

  public getModelVersion(): string {
    const versionMatch = this.currentModel.match(/\d+(\.\d+)*/);
    return versionMatch ? versionMatch[0] : "unknown";
  }

  private async executeCompletion(prompt: string): Promise<LLMResponse> {
    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(
      () => controller.abort(),
      this.config.timeout
    );

    try {
      return await this.executeAnthropicCompletion(prompt, controller.signal);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async executeAnthropicCompletion(
    prompt: string,
    signal: AbortSignal
  ): Promise<LLMResponse> {
    if (!this.anthropic) throw new Error("Anthropic client not initialized");

    const response = await this.anthropic.messages.create(
      {
        model: this.currentModel,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        messages: [{ role: "user", content: prompt }],
      },
      { signal }
    );

    return {
      text: response.content[0].type === "text" ? response.content[0].text : "",
      model: this.currentModel,
      usage: {
        prompt_tokens: 0, // Anthropic doesn't provide token counts
        completion_tokens: 0,
        total_tokens: 0,
      },
      metadata: {
        stop_reason: response.stop_reason,
      },
    };
  }

  private getDefaultModel(provider: string): string {
    return "claude-3-5-haiku-20241022";
  }

  private getApiKeyFromEnv(provider: string): string {
    if (provider === "anthropic") {
      return env.ANTHROPIC_API_KEY;
    }

    throw new Error(`Unsupported provider: ${provider}`);
  }

  private shouldRetry(error: Error, attempt: number): boolean {
    if (attempt >= this.config.maxRetries) return false;

    // Retry on rate limits, timeouts, and temporary server errors
    if (error.name === "AbortError") return true;
    if (error.message.includes("rate limit")) return true;
    if (error.message.includes("timeout")) return true;
    if (error.message.includes("5")) return true; // 5xx errors

    return false;
  }

  private calculateBackoff(attempt: number): number {
    const exponentialDelay = this.config.baseDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 1000;
    return Math.min(exponentialDelay + jitter, this.config.maxDelay);
  }

  private enhanceError(error: Error): Error {
    const enhancedError = new Error(
      `LLM Error (${this.config.provider}): ${error.message}`
    );
    enhancedError.cause = error;
    return enhancedError;
  }

  async analyze(
    prompt: string,
    options: AnalysisOptions = {}
  ): Promise<string | StructuredAnalysis> {
    const {
      role = "financial analyst",
      temperature = 0.7,
      maxTokens = 1500,
      formatResponse = false,
    } = options;

    const response = await this.anthropic?.messages.create({
      model: this.currentModel,
      messages: [
        {
          role: "assistant",
          content: `You are a ${role} assistant. Analyze information objectively and provide structured responses with clear reasoning. Be specific about confidence levels and uncertainties.`,
        },
        {
          role: "user",
          content: formatResponse
            ? prompt + "\n\nProvide response in JSON format."
            : prompt,
        },
      ],
      temperature,
      max_tokens: maxTokens,
    });

    const result =
      response?.content[0]?.type === "text" ? response.content[0].text : "";

    if (formatResponse && result) {
      try {
        return JSON.parse(result) as StructuredAnalysis;
      } catch (e) {
        console.warn("Failed to parse structured response, returning raw text");
        return result;
      }
    }

    return result;
  }
}

// Error types
export class LLMError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "LLMError";
  }
}

export class LLMTimeoutError extends LLMError {
  constructor(provider: string, timeoutMs: number) {
    super(`LLM request timed out after ${timeoutMs}ms`, provider);
    this.name = "LLMTimeoutError";
  }
}

export class LLMRateLimitError extends LLMError {
  constructor(provider: string, retryAfter?: number) {
    super(
      `Rate limit exceeded${retryAfter ? `, retry after ${retryAfter}s` : ""}`,
      provider
    );
    this.name = "LLMRateLimitError";
  }
}
