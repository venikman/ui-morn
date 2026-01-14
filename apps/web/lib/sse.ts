export type SseMessage = {
  event: string;
  data: string;
  id?: string;
};

export type SseConnectOptions = {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  onMessage: (message: SseMessage) => void;
  onOpen?: (response: Response) => void;
  onBytes?: (bytes: number) => void;
  onError?: (error: Error) => void;
};

export const connectSse = ({
  url,
  method = "GET",
  headers,
  body,
  onMessage,
  onOpen,
  onBytes,
  onError,
}: SseConnectOptions) => {
  const controller = new AbortController();
  let lastEventId: string | null = null;

  const start = async () => {
    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`SSE request failed with status ${response.status}`);
      }

      onOpen?.(response);

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("SSE response has no body.");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        if (value) {
          onBytes?.(value.length);
          buffer += decoder.decode(value, { stream: true });
        }

        let boundaryIndex = findBoundary(buffer);
        while (boundaryIndex !== -1) {
          const separatorLength = buffer.startsWith("\r\n\r\n", boundaryIndex)
            ? 4
            : 2;
          const rawEvent = buffer.slice(0, boundaryIndex);
          buffer = buffer.slice(boundaryIndex + separatorLength);
          handleRawEvent(rawEvent);
          boundaryIndex = findBoundary(buffer);
        }
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      onError?.(error as Error);
    }
  };

  const handleRawEvent = (rawEvent: string) => {
    const lines = rawEvent.split(/\r?\n/);
    let event = "message";
    let data = "";
    let id: string | undefined;

    for (const line of lines) {
      if (!line || line.startsWith(":")) {
        continue;
      }

      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
        continue;
      }

      if (line.startsWith("data:")) {
        data += `${line.slice(5).trim()}\n`;
        continue;
      }

      if (line.startsWith("id:")) {
        id = line.slice(3).trim();
        continue;
      }
    }

    data = data.replace(/\n$/, "");
    if (id) {
      lastEventId = id;
    }

    onMessage({ event, data, id });
  };

  const findBoundary = (value: string) => {
    const unixIndex = value.indexOf("\n\n");
    const windowsIndex = value.indexOf("\r\n\r\n");

    if (unixIndex === -1) {
      return windowsIndex;
    }
    if (windowsIndex === -1) {
      return unixIndex;
    }
    return Math.min(unixIndex, windowsIndex);
  };

  return {
    start,
    close: () => controller.abort(),
    getLastEventId: () => lastEventId,
    isClosed: () => controller.signal.aborted,
  };
};
