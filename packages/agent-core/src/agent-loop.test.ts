// Agent Core tests cover agent loop behavior.
import { describe, expect, it, vi } from "vitest";
import { agentLoop, agentLoopContinue, runAgentLoop } from "./agent-loop.js";
import {
  createAssistantMessageEventStream,
  type Context,
  type Message,
  type Model,
} from "./llm.js";
import type {
  AgentContext,
  AgentEvent,
  AgentLoopConfig,
  AgentMessage,
  AgentTool,
  AgentToolResult,
  StreamFn,
} from "./types.js";

const model: Model = {
  id: "test-model",
  name: "Test Model",
  api: "test-api",
  provider: "test-provider",
  baseUrl: "https://example.test",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1000,
  maxTokens: 1000,
};

const config: AgentLoopConfig = {
  model,
  convertToLlm: (messages) => messages as Message[],
};

const TEST_USAGE = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

const failingStreamFn: StreamFn = async () => {
  throw new Error("provider exploded");
};

async function collectEvents(stream: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

function expectTerminalFailure(events: AgentEvent[], result: AgentMessage[]): void {
  expect(events.map((event) => event.type)).toContain("agent_end");
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({
    role: "assistant",
    stopReason: "error",
    errorMessage: "provider exploded",
  });
}

describe("agentLoop EventStream failures", () => {
  it("ends the public stream when a new prompt run rejects", async () => {
    const stream = agentLoop(
      [{ role: "user", content: "hello", timestamp: 1 }],
      { systemPrompt: "", messages: [] },
      config,
      undefined,
      failingStreamFn,
    );

    const events = await collectEvents(stream);
    const result = await stream.result();

    expectTerminalFailure(events, result);
  });

  it("ends the public stream when a continue run rejects", async () => {
    const context: AgentContext = {
      systemPrompt: "",
      messages: [{ role: "user", content: "hello", timestamp: 1 }],
    };
    const stream = agentLoopContinue(context, config, undefined, failingStreamFn);

    const events = await collectEvents(stream);
    const result = await stream.result();

    expectTerminalFailure(events, result);
  });
});

describe("runAgentLoop missing tool resolution", () => {
  it("hydrates an authorized missing tool for execution and the continuation", async () => {
    const execute = vi.fn(
      async (): Promise<AgentToolResult<unknown>> => ({
        content: [{ type: "text", text: "hidden ok" }],
        details: { ok: true },
      }),
    );
    const hiddenTool: AgentTool = {
      name: "hidden_search",
      label: "hidden_search",
      description: "Hidden search tool",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
      execute,
    };
    const contexts: Context[] = [];
    let streamCalls = 0;
    const streamFn: StreamFn = (_model, context) => {
      contexts.push({ ...context, tools: context.tools?.slice() });
      const stream = createAssistantMessageEventStream();
      queueMicrotask(() => {
        streamCalls += 1;
        const message =
          streamCalls === 1
            ? {
                role: "assistant" as const,
                content: [
                  {
                    type: "toolCall" as const,
                    id: "call-hidden",
                    name: "hidden_search",
                    arguments: { query: "penguin" },
                  },
                ],
                api: "faux",
                provider: "faux",
                model: "faux-1",
                usage: TEST_USAGE,
                stopReason: "toolUse" as const,
                timestamp: Date.now(),
              }
            : {
                role: "assistant" as const,
                content: [{ type: "text" as const, text: "done" }],
                api: "faux",
                provider: "faux",
                model: "faux-1",
                usage: TEST_USAGE,
                stopReason: "stop" as const,
                timestamp: Date.now(),
              };
        stream.push({ type: "done", reason: message.stopReason, message });
      });
      return stream;
    };
    const resolveMissingTool = vi.fn(() => hiddenTool);

    const messages = await runAgentLoop(
      [{ role: "user", content: "search penguin", timestamp: Date.now() }],
      { systemPrompt: "test", messages: [], tools: [] },
      {
        model,
        convertToLlm: (agentMessages: AgentMessage[]) => agentMessages as never,
        resolveMissingTool,
      },
      (_event: AgentEvent) => {},
      undefined,
      streamFn,
    );

    expect(resolveMissingTool).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(
      "call-hidden",
      { query: "penguin" },
      undefined,
      expect.any(Function),
    );
    expect(contexts.map((context) => context.tools?.map((tool) => tool.name) ?? [])).toEqual([
      [],
      ["hidden_search"],
    ]);
    expect(messages.some((message) => message.role === "toolResult")).toBe(true);
  });
});
