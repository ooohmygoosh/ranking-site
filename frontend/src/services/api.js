const baseUrl = '/api';

function getToken() {
  return localStorage.getItem('authToken');
}

async function request(url, options = {}) {
  const headers = { ...(options.headers || {}), 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(baseUrl + url, { ...options, headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || '请求失败');
  }
  return response.json();
}

export function loginApi(username, password) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
}

export function registerApi(username, password) {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
}

export function getUserApi() {
  return request('/auth/me');
}

export function getListsApi() {
  return request('/lists');
}

export function createListApi(payload) {
  return request('/lists', {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function getListApi(listId) {
  return request(`/lists/${encodeURIComponent(listId)}`);
}

export function getListSummaryApi(listId) {
  return request(`/lists/${encodeURIComponent(listId)}/summary`);
}

export function submitRankingApi(listId, payload) {
  return request(`/lists/${encodeURIComponent(listId)}/submissions`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function createCommentApi(listId, content) {
  return request(`/lists/${encodeURIComponent(listId)}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content })
  });
}

export function likeCommentApi(commentId) {
  return request(`/comments/${encodeURIComponent(commentId)}/like`, {
    method: 'POST',
    body: JSON.stringify({})
  });
}

export function getAdminOverviewApi() {
  return request('/admin/overview');
}

export function deleteAdminListApi(listId) {
  return request(`/admin/lists/${encodeURIComponent(listId)}`, {
    method: 'DELETE'
  });
}

export function deleteAdminSubmissionApi(submissionId) {
  return request(`/admin/submissions/${encodeURIComponent(submissionId)}`, {
    method: 'DELETE'
  });
}

export function deleteAdminCandidateApi(candidateId) {
  return request(`/admin/candidates/${encodeURIComponent(candidateId)}`, {
    method: 'DELETE'
  });
}

export function deleteAdminCommentApi(commentId) {
  return request(`/admin/comments/${encodeURIComponent(commentId)}`, {
    method: 'DELETE'
  });
}

export function deleteAdminUserApi(userId) {
  return request(`/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE'
  });
}

export function updateAdminUserRoleApi(userId, isAdmin) {
  return request(`/admin/users/${encodeURIComponent(userId)}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ isAdmin })
  });
}

export function createCandidateApi(listId, payload) {
  return request(`/lists/${encodeURIComponent(listId)}/candidates`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function supportCandidateApi(candidateId) {
  return request(`/candidates/${encodeURIComponent(candidateId)}/support`, {
    method: 'POST',
    body: JSON.stringify({})
  });
}
