// API base URL — reads from Vite env at build time.
// In development, Vite's proxy handles /api → localhost:8080.
// In production, this points to the deployed backend domain.
export const API_BASE_URL = import.meta.env.VITE_API_URL || ''
