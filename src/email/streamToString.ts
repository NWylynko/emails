/**
 * Reading a large email used to be `result += decoder.decode(chunk)` in a loop,
 * which is quadratic in the number of chunks — a 15MB message with an inlined
 * photo burned the whole CPU budget here before the handler did any work.
 * `Response.text()` is the runtime's native path and does this in one pass.
 */
export async function streamToString(
  stream: ReadableStream<Uint8Array>
): Promise<string> {
  return await new Response(stream).text();
}
