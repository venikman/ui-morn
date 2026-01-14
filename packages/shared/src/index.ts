import { z } from "zod";

export const A2ADataPartSchema = z
  .object({
    mimeType: z.string().optional(),
    payload: z.unknown().optional(),
  })
  .strict();

export const A2AFilePartSchema = z
  .object({
    name: z.string().optional(),
    contentType: z.string().optional(),
    url: z.string().optional(),
  })
  .strict();

export const A2APartSchema = z
  .object({
    text: z.string().optional(),
    file: A2AFilePartSchema.optional(),
    data: A2ADataPartSchema.optional(),
    metadata: z.record(z.string()).optional(),
  })
  .refine(
    (value) =>
      [value.text, value.file, value.data].filter((entry) => entry !== undefined)
        .length === 1,
    { message: "Part must contain exactly one of text, file, or data." }
  );

export type A2APart = z.infer<typeof A2APartSchema>;

export const A2ARequestMessageSchema = z.object({
  role: z.string(),
  parts: z.array(A2APartSchema).min(1),
  metadata: z.record(z.unknown()).optional(),
});

export type A2ARequestMessage = z.infer<typeof A2ARequestMessageSchema>;

export const A2UIBeginRenderingSchema = z
  .object({
    beginRendering: z.object({
      surfaceId: z.string(),
    }),
  })
  .strict();

export const A2UISurfaceUpdateSchema = z
  .object({
    surfaceUpdate: z.object({
      surfaceId: z.string(),
      components: z.array(z.unknown()),
    }),
  })
  .strict();

export const A2UIDataModelUpdateSchema = z
  .object({
    dataModelUpdate: z.object({
      surfaceId: z.string(),
      entries: z.array(
        z.object({
          path: z.string(),
          valueString: z.string().optional(),
          valueNumber: z.number().optional(),
          valueBoolean: z.boolean().optional(),
          valueMap: z.record(z.unknown()).optional(),
        })
      ),
    }),
  })
  .strict();

export const A2UIDeleteSurfaceSchema = z
  .object({
    deleteSurface: z.object({
      surfaceId: z.string(),
    }),
  })
  .strict();

export const A2UIMessageSchema = z.union([
  A2UIBeginRenderingSchema,
  A2UISurfaceUpdateSchema,
  A2UIDataModelUpdateSchema,
  A2UIDeleteSurfaceSchema,
]);

export type A2UIMessage = z.infer<typeof A2UIMessageSchema>;

export const MetricsSchema = z.object({
  scenario: z.string(),
  startedAt: z.string(),
  ttftSeconds: z.number().nullable(),
  firstInteractiveSeconds: z.number().nullable(),
  totalBytes: z.number(),
  userActions: z.number(),
  retries: z.number(),
  toolApprovals: z.number(),
  errors: z.number(),
});

export type Metrics = z.infer<typeof MetricsSchema>;
