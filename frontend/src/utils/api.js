const API = "http://localhost:4000";

export function getToken() {
  return localStorage.getItem("token");
}

export function setToken(token) {
  localStorage.setItem("token", token);
}

export function clearToken() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

export function getUser() {
  const u = localStorage.getItem("user");
  return u ? JSON.parse(u) : null;
}

export function setUser(user) {
  localStorage.setItem("user", JSON.stringify(user));
}

export async function api(path, options = {}) {
  const token = getToken();
  const headers = { "Content-Type": "application/json", ...options.headers };
  if (token) headers.Authorization = "Bearer " + token;

  const res = await fetch(API + path, { ...options, headers });
  if (res.status === 401 || res.status === 403) {
    clearToken();
    window.location.hash = "#/login";
    throw new Error("Unauthorized");
  }
  return res;
}

// Convenience: fetch + parse JSON
export async function apiFetch(path, options = {}) {
  const res = await api(path, options);
  return res.json();
}
