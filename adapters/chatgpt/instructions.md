# ChatGPT adapter

ChatGPT cannot write to a host file directly. Use one of two local paths:

1. **Custom GPT Action** (live capture). Import `openapi.yaml` into a custom GPT, set the server URL to your own HTTPS tunnel that reaches this machine, and paste the ingest token from the plugin's **Connect** tab. Add the instruction below.
2. **Conversation export import** (backfill). Export ChatGPT data, then run `node adapters/chatgpt/import.mjs conversations.json`.

## Custom GPT instruction

At the end of every completed turn, call `logPrompt` exactly once. Copy the user's prompt and your final answer verbatim. Set `platform` to `chatgpt`, `provider` to `openai`, and include the model slug when known. Use the conversation id plus the user message id as `source_key` so retries do not create duplicates. Do not guess token counts; omit them if the interface does not show them. If the call fails, tell the user the Prompt Ledger bridge is unavailable and continue the conversation normally.

## Security

The token grants write access to your local ledger. Keep the tunnel private, rotate the token from the plugin UI if it leaks, and never publish the endpoint. The bridge accepts only `POST /prompt-ledger/v1/ingest` and a health check, nothing else.
