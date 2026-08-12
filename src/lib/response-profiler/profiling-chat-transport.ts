import {
  DefaultChatTransport,
  type HttpChatTransportInitOptions,
  type UIMessage,
  type UIMessageChunk,
} from "ai";
import type { ClientTraceCollector } from "./client-trace";

type SendMessages<UI_MESSAGE extends UIMessage> =
  DefaultChatTransport<UI_MESSAGE>["sendMessages"];

export class ProfilingChatTransport<
  UI_MESSAGE extends UIMessage,
> extends DefaultChatTransport<UI_MESSAGE> {
  private readonly getCollector: (
    clientMessageId: string | undefined,
  ) => ClientTraceCollector | undefined;
  private readonly sendMessagesOverride?: SendMessages<UI_MESSAGE>;

  constructor(
    options: HttpChatTransportInitOptions<UI_MESSAGE> & {
      getCollector: (
        clientMessageId: string | undefined,
      ) => ClientTraceCollector | undefined;
      sendMessages?: SendMessages<UI_MESSAGE>;
    },
  ) {
    const { getCollector, sendMessages, ...transportOptions } = options;
    super(transportOptions);
    this.getCollector = getCollector;
    this.sendMessagesOverride = sendMessages;
  }

  override async sendMessages(
    options: Parameters<SendMessages<UI_MESSAGE>>[0],
  ): Promise<ReadableStream<UIMessageChunk>> {
    const submittedId =
      options.trigger === "submit-message"
        ? [...options.messages]
            .reverse()
            .find((message) => message.role === "user")?.id
        : options.messages.some(
              (message) =>
                message.role === "user" && message.id === options.messageId,
            )
          ? options.messageId
          : undefined;
    const collector = this.getCollector(submittedId);
    let traceAbandoned = false;
    const abandonTrace = () => {
      if (traceAbandoned) return;
      traceAbandoned = true;
      collector?.abandon();
    };

    let source: ReadableStream<UIMessageChunk>;
    try {
      source = await (this.sendMessagesOverride
        ? this.sendMessagesOverride(options)
        : super.sendMessages(options));
    } catch (error) {
      abandonTrace();
      throw error;
    }
    collector?.markStreamOpened();

    let sawChunk = false;
    let sawText = false;
    const observed = source.pipeThrough(
      new TransformStream<UIMessageChunk, UIMessageChunk>({
        transform(chunk, controller) {
          if (!sawChunk) {
            sawChunk = true;
            collector?.markFirstChunkReceived();
          }
          if (
            !sawText &&
            chunk.type === "text-delta" &&
            chunk.delta.length > 0
          ) {
            sawText = true;
            collector?.markFirstTextDeltaReceived();
          }
          controller.enqueue(chunk);
        },
        flush() {
          collector?.markStreamCompleted();
        },
      }),
    );
    const reader = observed.getReader();
    return new ReadableStream<UIMessageChunk>({
      async pull(controller) {
        try {
          const next = await reader.read();
          if (next.done) controller.close();
          else controller.enqueue(next.value);
        } catch (error) {
          abandonTrace();
          controller.error(error);
        }
      },
      async cancel(reason) {
        abandonTrace();
        await reader.cancel(reason).catch(() => undefined);
      },
    });
  }
}
