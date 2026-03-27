export async function fetchHandbookHtml(handbookId: string): Promise<string> {
  if (!handbookId) {
    throw new Error('Missing handbook id.');
  }

  const response = await fetch(`/api/guide/${handbookId}`, {
    method: 'GET',
    headers: {
      Accept: 'text/html',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to load handbook HTML (${response.status}).`);
  }

  return response.text();
}
