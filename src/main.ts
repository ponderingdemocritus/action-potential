import { env } from "./core/env";
import { LLMClient } from "./core/llm-client";
import { TwitterClient } from "./clients/twitterClient";
import { CoreActionRegistry } from "./core/actions";
import { Core } from "./core/core";
import { LLMIntentExtractor } from "./core/intent";
import { LogLevel } from "./core/logger";
import { EventProcessor } from "./core/processor";
import { RoomManager } from "./core/roomManager";

async function main() {
  // Validate environment variables before proceeding
  console.log("Validating environment configuration...");

  // Environment is already validated by the schema,
  // but we can do additional checks here if needed
  const twitterConfig = {
    username: env.TWITTER_USERNAME,
    password: env.TWITTER_PASSWORD,
    email: env.TWITTER_EMAIL,
  };

  console.log("Twitter configuration validated ✓");

  // Initialize your LLM client
  const llmClient = new LLMClient({
    provider: "anthropic",
  });

  console.log("LLM client initialized ✓");

  // Mock vector DB for development
  const mockVectorDb = {
    async findSimilar(
      content: string,
      limit?: number,
      metadata?: Record<string, any>
    ) {
      return [];
    },
    async store(content: string, metadata?: Record<string, any>) {
      // Store implementation
    },
    async delete(id: string) {
      // Delete implementation
    },
  };

  // Initialize dependencies with real LLM client
  const intentExtractor = new LLMIntentExtractor(llmClient);
  const processor = new EventProcessor(
    mockVectorDb,
    intentExtractor,
    llmClient,
    new CoreActionRegistry()
  );
  const roomManager = new RoomManager(mockVectorDb);

  // Initialize core with custom logging config
  const core = new Core(processor, roomManager, {
    logging: {
      level: LogLevel.DEBUG, // Set to DEBUG for development
      enableColors: true,
      enableTimestamp: true,
      logToFile: true,
      logPath: "./logs",
    },
  });

  // Initialize Twitter client with credentials
  const twitterClient = new TwitterClient("twitter", twitterConfig, core);

  // Register client with core
  core.registerClient(twitterClient);

  // The clients will automatically start listening for their respective events
  console.log("System initialized and running...");

  // Example of how rooms work
  process.on("SIGINT", async () => {
    await Promise.all([twitterClient.stop()]);
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Application failed to start:", error);
  process.exit(1);
});
