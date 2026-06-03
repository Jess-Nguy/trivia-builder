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
