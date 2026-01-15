export const decodeHtmlEntities = (text: string): string => {
  if (typeof document === 'undefined') {
    return text
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#x2F;/g, '/');
  }
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
};

export const stripHtmlTags = (text: string | undefined): string | undefined => {
  if (!text) return text;
  return decodeHtmlEntities(
    text.replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
  );
};