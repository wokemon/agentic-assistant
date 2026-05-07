export function parseAgentResponse(response: string) {
  response = response.trim();

  // ----------------------------
  // 1. TRY TOOL CALL (JSON mode)
  // ----------------------------
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);

      if (parsed.tool && parsed.args) {
        return {
          toolCall: {
            tool: parsed.tool,
            args: parsed.args,
          },
        };
      }
    }
  } catch (e) {
    // ignore JSON errors, fallback below
  }

  // ----------------------------
  // 2. FINAL ANSWER MODE
  // ----------------------------
  if (response.includes("FINAL:")) {
    return {
      finalAnswer: response.split("FINAL:")[1].trim(),
    };
  }

  // ----------------------------
  // 3. FALLBACK (safe failure)
  // ----------------------------
  return {
    invalid: true,
  };
}
