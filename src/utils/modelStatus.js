export async function fetchModelStatus() {
  try {
    const response = await fetch('/api/ai?action=status');
    if (response.ok) {
      return await response.json();
    }
  } catch {
    // ignore network errors and fall back to env flags
  }

  return {
    qwen: Boolean(import.meta.env.VITE_QWEN_API_KEY),
    gemini: Boolean(import.meta.env.VITE_GOOGLE_API_KEY)
  };
}
