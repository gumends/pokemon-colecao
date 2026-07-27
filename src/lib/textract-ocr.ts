import {
  DetectDocumentTextCommand,
  TextractClient,
} from "@aws-sdk/client-textract";

function stripDataUrl(imageBase64: string): string {
  return imageBase64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
}

function getTextractClient(): TextractClient | null {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  const region =
    process.env.AWS_REGION?.trim() ||
    process.env.AWS_DEFAULT_REGION?.trim() ||
    "us-east-1";

  if (!accessKeyId || !secretAccessKey) return null;

  return new TextractClient({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
}

/** OCR via Amazon Textract no servidor Next (quando há AWS_* no env). */
export async function extractTextWithTextract(
  imageBase64: string,
): Promise<string | null> {
  const client = getTextractClient();
  if (!client) return null;

  const bytes = Buffer.from(stripDataUrl(imageBase64), "base64");
  if (bytes.length === 0) return "";
  if (bytes.length > 9_500_000) {
    throw new Error("Imagem grande demais para o Textract (máx. ~10 MB).");
  }

  const response = await client.send(
    new DetectDocumentTextCommand({
      Document: { Bytes: bytes },
    }),
  );

  const lines =
    response.Blocks?.filter(
      (b) => b.BlockType === "LINE" && Boolean(b.Text?.trim()),
    ).map((b) => b.Text!.trim()) ?? [];

  return lines.join("\n");
}

export function hasTextractCredentials(): boolean {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID?.trim() &&
      process.env.AWS_SECRET_ACCESS_KEY?.trim(),
  );
}
