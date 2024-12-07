import { env } from "./core/env";
import { LLMClient } from "./core/llm-client";
import { TwitterClient } from "./clients/twitterClient";
import { CoreActionRegistry } from "./core/actions";
import { Core } from "./core/core";
import { LLMIntentExtractor } from "./core/intent";
import { LogLevel } from "./core/logger";
import { EventProcessor } from "./core/processor";
import { RoomManager } from "./core/roomManager";
import { Consciousness } from "./core/consciousness";
import { ChromaVectorDB } from "./core/vectorDb";

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

  // Initialize vector DB
  const vectorDb = new ChromaVectorDB("ai_consciousness", {
    logLevel: LogLevel.DEBUG,
  });

  // Initialize room manager with vector DB
  const roomManager = new RoomManager(vectorDb, {
    logLevel: LogLevel.DEBUG,
  });

  // Initialize other dependencies
  const intentExtractor = new LLMIntentExtractor(llmClient);
  const processor = new EventProcessor(
    vectorDb,
    intentExtractor,
    llmClient,
    new CoreActionRegistry()
  );

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

  // Initialize consciousness after core is set up
  const consciousness = new Consciousness(core, llmClient, roomManager, {
    intervalMs: 3000, // Think every 5 minutes
    minConfidence: 0.7, // Only act on thoughts with high confidence
    logLevel: LogLevel.DEBUG,
  });

  // Start the consciousness
  await consciousness.start();

  // The clients will automatically start listening for their respective events
  console.log("System initialized and running...");

  // Example of how rooms work
  process.on("SIGINT", async () => {
    await Promise.all([twitterClient.stop(), consciousness.stop()]);
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Application failed to start:", error);
  process.exit(1);
});
