import { z } from "zod";

export const envSchema = z.object({
  // LLM Configuration
  ANTHROPIC_API_KEY: z.string().min(1, "Anthropic API key is required"),

  // Twitter Configuration
  TWITTER_USERNAME: z.string().min(1, "Twitter username is required"),
  TWITTER_PASSWORD: z.string().min(1, "Twitter password is required"),
  TWITTER_EMAIL: z.string().email("Valid Twitter email is required"),

  // OpenAI Configuration
  OPENAI_API_KEY: z.string().min(1, "OpenAI API key is required"),
});

// Parse and validate environment variables
export const env = envSchema.parse(process.env);
