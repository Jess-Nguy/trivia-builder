// Wikidata asks clients to identify themselves; set HARVESTER_USER_AGENT to add contact details.
export const USER_AGENT = process.env.HARVESTER_USER_AGENT || 'trivia-builder-harvester/1.0 (personal trivia game)';

export async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, ...headers } });
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
  return res.json();
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
