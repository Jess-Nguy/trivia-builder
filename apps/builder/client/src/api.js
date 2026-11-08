// Thin wrapper around the backend API.

export async function fetchFiles() {
  const res = await fetch('/api/files');
  if (!res.ok) throw new Error('Could not load file list.');
  const { files } = await res.json();
  return files;
}

export async function fetchQuestions(name) {
  const res = await fetch(`/api/files/${encodeURIComponent(name)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not load questions.');
  return data; // { name, questions, problems, total }
}

// Background-music tracks from `import/background audio.csv`. Returns [] on any
// failure so the picker just offers "None" rather than blocking the page.
export async function fetchBackgroundAudio() {
  try {
    const res = await fetch('/api/background-audio');
    if (!res.ok) return [];
    const { tracks } = await res.json();
    return Array.isArray(tracks) ? tracks : [];
  } catch {
    return [];
  }
}

async function request(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || 'Request failed.');
    err.problems = data.problems || [];
    throw err;
  }
  return data;
}

// --- Question bank and playlists (data/questions.json, data/playlists.json) ---

export const fetchLibrary = () => request('/api/library'); // { questions, playlists, categories }
export const createQuestion = (q) => request('/api/library/questions', { method: 'POST', body: q });
export const updateQuestion = (id, q) =>
  request(`/api/library/questions/${encodeURIComponent(id)}`, { method: 'PUT', body: q });
export const deleteQuestion = (id) =>
  request(`/api/library/questions/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const markSeen = (ids) => request('/api/library/seen', { method: 'POST', body: { ids } });

export const createPlaylist = (p) => request('/api/library/playlists', { method: 'POST', body: p });
export const updatePlaylist = (id, p) =>
  request(`/api/library/playlists/${encodeURIComponent(id)}`, { method: 'PUT', body: p });
export const deletePlaylist = (id) =>
  request(`/api/library/playlists/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const addToPlaylist = (id, questionIds) =>
  request(`/api/library/playlists/${encodeURIComponent(id)}/add`, { method: 'POST', body: { questionIds } });
export const playlistCsvUrl = (id) => `/api/library/playlists/${encodeURIComponent(id)}/csv`;

// A playlist in the same shape as fetchQuestions, plus `ordered`.
export const fetchPlaylist = (id) => request(`/api/library/playlists/${encodeURIComponent(id)}`);

export const importCsv = (fileName) => request('/api/library/import', { method: 'POST', body: { fileName } });
